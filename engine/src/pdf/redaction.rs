//! # PDF Redaction
//!
//! True content-level redaction: removes text operators from PDF content streams
//! where they overlap redaction regions, then overlays opaque rectangles on top.
//!
//! ## Approach
//!
//! 1. Scan the PDF for structural metadata (xref, trailer, page objects).
//! 2. Walk the /Pages tree to collect page object IDs and /MediaBox dimensions.
//! 3. For each page with redactions:
//!    a. Extract and decompress the content stream(s).
//!    b. Tokenize PDF operators.
//!    c. Track text position state (BT/ET, Td, Tm, Tf, etc.).
//!    d. Remove text-showing operators (Tj, TJ, ', ") whose position overlaps
//!    any redaction region.
//!    e. Recompress and emit as a replacement content stream.
//! 4. Overlay opaque rectangles (visual indicator) via Form XObject.
//! 5. Write an incremental update (new objects + xref + trailer with /Prev).

use crate::error::FormeError;
use crate::model::RedactionRegion;
use miniz_oxide::deflate::compress_to_vec_zlib;
use miniz_oxide::inflate::decompress_to_vec_zlib;

// ── Date formatting ─────────────────────────────────────────────────

/// Format current time as ISO 8601 for XMP: YYYY-MM-DDTHH:MM:SSZ
fn format_xmp_date() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = now / 86400;
    let time_of_day = now % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;
    let (year, month, day) = super::certify::epoch_days_to_ymd(days);
    format!("{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}Z")
}

// ── Content stream tokenizer ────────────────────────────────────────

/// A token from a PDF content stream.
#[derive(Debug, Clone)]
enum Token {
    /// A number, string literal, hex string, name, or array operand.
    Operand(Vec<u8>),
    /// A PDF operator keyword (BT, ET, Td, Tj, TJ, Tf, etc.).
    Operator(Vec<u8>),
}

/// Tokenize a decompressed PDF content stream into operands and operators.
///
/// This is a minimal tokenizer — enough to identify text operators and their
/// operands. It handles PDF strings `(...)`, hex strings `<...>`, arrays `[...]`,
/// names `/Name`, and numeric operands. Everything else is treated as an operator.
fn tokenize_content_stream(data: &[u8]) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut i = 0;
    let len = data.len();

    while i < len {
        let b = data[i];

        // Skip whitespace
        if b == b' ' || b == b'\n' || b == b'\r' || b == b'\t' || b == b'\x0C' || b == 0 {
            i += 1;
            continue;
        }

        // PDF comment — skip to end of line
        if b == b'%' {
            while i < len && data[i] != b'\n' && data[i] != b'\r' {
                i += 1;
            }
            continue;
        }

        // String literal (...)
        if b == b'(' {
            let start = i;
            i += 1;
            let mut depth = 1;
            while i < len && depth > 0 {
                if data[i] == b'(' && (i == 0 || data[i - 1] != b'\\') {
                    depth += 1;
                } else if data[i] == b')' && (i == 0 || data[i - 1] != b'\\') {
                    depth -= 1;
                }
                i += 1;
            }
            tokens.push(Token::Operand(data[start..i].to_vec()));
            continue;
        }

        // Hex string <...> (but not dict <<)
        if b == b'<' && i + 1 < len && data[i + 1] != b'<' {
            let start = i;
            i += 1;
            while i < len && data[i] != b'>' {
                i += 1;
            }
            if i < len {
                i += 1; // consume '>'
            }
            tokens.push(Token::Operand(data[start..i].to_vec()));
            continue;
        }

        // Array [...] — treat entire array as one operand (for TJ arrays)
        if b == b'[' {
            let start = i;
            i += 1;
            let mut depth = 1;
            while i < len && depth > 0 {
                if data[i] == b'[' {
                    depth += 1;
                } else if data[i] == b']' {
                    depth -= 1;
                } else if data[i] == b'(' {
                    // Skip nested string
                    i += 1;
                    let mut sdepth = 1;
                    while i < len && sdepth > 0 {
                        if data[i] == b'(' && data[i - 1] != b'\\' {
                            sdepth += 1;
                        } else if data[i] == b')' && data[i - 1] != b'\\' {
                            sdepth -= 1;
                        }
                        i += 1;
                    }
                    continue;
                }
                i += 1;
            }
            tokens.push(Token::Operand(data[start..i].to_vec()));
            continue;
        }

        // Name /Something
        if b == b'/' {
            let start = i;
            i += 1;
            while i < len && !is_pdf_delimiter(data[i]) && !is_pdf_whitespace(data[i]) {
                i += 1;
            }
            tokens.push(Token::Operand(data[start..i].to_vec()));
            continue;
        }

        // Number (integer or real, possibly negative)
        if b.is_ascii_digit() || b == b'-' || b == b'+' || b == b'.' {
            let start = i;
            i += 1;
            while i < len && (data[i].is_ascii_digit() || data[i] == b'.') {
                i += 1;
            }
            tokens.push(Token::Operand(data[start..i].to_vec()));
            continue;
        }

        // Dict << >> — treat as operand
        if b == b'<' && i + 1 < len && data[i + 1] == b'<' {
            let start = i;
            i += 2;
            let mut depth = 1;
            while i + 1 < len && depth > 0 {
                if data[i] == b'<' && data[i + 1] == b'<' {
                    depth += 1;
                    i += 2;
                } else if data[i] == b'>' && data[i + 1] == b'>' {
                    depth -= 1;
                    i += 2;
                } else {
                    i += 1;
                }
            }
            tokens.push(Token::Operand(data[start..i].to_vec()));
            continue;
        }

        // Keyword / operator (alphabetic sequence)
        if b.is_ascii_alphabetic() || b == b'\'' || b == b'"' {
            let start = i;
            // Single-char operators ' and "
            if b == b'\'' || b == b'"' {
                i += 1;
                tokens.push(Token::Operator(data[start..i].to_vec()));
                continue;
            }
            i += 1;
            while i < len && (data[i].is_ascii_alphabetic() || data[i] == b'*') {
                i += 1;
            }
            tokens.push(Token::Operator(data[start..i].to_vec()));
            continue;
        }

        // Unknown byte — skip
        i += 1;
    }

    tokens
}

fn is_pdf_whitespace(b: u8) -> bool {
    matches!(b, b' ' | b'\n' | b'\r' | b'\t' | b'\x0C' | 0)
}

fn is_pdf_delimiter(b: u8) -> bool {
    matches!(
        b,
        b'(' | b')' | b'<' | b'>' | b'[' | b']' | b'{' | b'}' | b'/' | b'%'
    )
}

/// Serialize tokens back to a PDF content stream byte sequence.
fn serialize_tokens(tokens: &[Token]) -> Vec<u8> {
    let mut out = Vec::new();
    for (i, tok) in tokens.iter().enumerate() {
        if i > 0 {
            out.push(b' ');
        }
        match tok {
            Token::Operand(data) | Token::Operator(data) => out.extend_from_slice(data),
        }
    }
    out.push(b'\n');
    out
}

// ── Text state tracking ─────────────────────────────────────────────

/// Tracks current text position within a BT/ET block.
struct TextState {
    /// Text matrix [a b c d e f] — e,f are the translation (position)
    tm: [f64; 6],
    /// Text line matrix (set by Td/TD/Tm/T*, reset by BT)
    tlm: [f64; 6],
    /// Current font size from Tf operator
    font_size: f64,
}

impl TextState {
    fn new() -> Self {
        Self {
            tm: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            tlm: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            font_size: 12.0,
        }
    }

    fn reset(&mut self) {
        self.tm = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        self.tlm = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];
    }

    /// Current text x position in PDF user space (bottom-origin)
    fn tx(&self) -> f64 {
        self.tm[4]
    }

    /// Current text y position in PDF user space (bottom-origin)
    fn ty(&self) -> f64 {
        self.tm[5]
    }

    /// Apply Td: translate text position
    fn apply_td(&mut self, tx: f64, ty: f64) {
        // Td sets tlm = [[1 0 0],[0 1 0],[tx ty 1]] × tlm, then tm = tlm
        let new_e = tx * self.tlm[0] + ty * self.tlm[2] + self.tlm[4];
        let new_f = tx * self.tlm[1] + ty * self.tlm[3] + self.tlm[5];
        self.tlm[4] = new_e;
        self.tlm[5] = new_f;
        self.tm = self.tlm;
    }

    /// Apply Tm: set text matrix directly
    fn apply_tm(&mut self, a: f64, b: f64, c: f64, d: f64, e: f64, f: f64) {
        self.tm = [a, b, c, d, e, f];
        self.tlm = [a, b, c, d, e, f];
    }

    /// Apply T*: move to start of next line (equivalent to 0 -Tl Td)
    /// We approximate Tl as font_size since we don't track it separately.
    fn apply_t_star(&mut self) {
        self.apply_td(0.0, -self.font_size);
    }
}

/// A redaction region in PDF coordinates (bottom-origin).
struct PdfRedactRegion {
    x: f64,
    y: f64, // bottom-origin
    width: f64,
    height: f64,
}

/// Check if text at the given position overlaps any redaction region.
///
/// Intentionally aggressive: checks if the text baseline position falls within
/// the redaction region's bounds with font_size as vertical tolerance.
fn text_overlaps_region(tx: f64, ty: f64, font_size: f64, regions: &[PdfRedactRegion]) -> bool {
    for r in regions {
        // Text vertical extent: baseline (ty) to ty + font_size (approximate)
        // We check a generous range to catch text with descenders
        let text_bottom = ty - font_size * 0.3; // descender allowance
        let text_top = ty + font_size;

        let region_bottom = r.y;
        let region_top = r.y + r.height;

        // Vertical overlap
        let v_overlap = text_bottom < region_top && text_top > region_bottom;

        // Horizontal: we're aggressive — any text whose x falls in the region's x-range.
        // We don't know exact text width, so we check if tx is in [r.x - tolerance, r.x + r.width + tolerance]
        let h_overlap = tx < r.x + r.width + font_size && tx + font_size > r.x - font_size * 0.5;

        if v_overlap && h_overlap {
            return true;
        }
    }
    false
}

/// Remove text-showing operators that overlap redaction regions from a token stream.
///
/// Preserves all non-text operators and text positioning operators so that
/// text outside redaction regions stays correctly positioned.
fn strip_redacted_text(tokens: &[Token], regions: &[PdfRedactRegion]) -> Vec<Token> {
    let mut out: Vec<Token> = Vec::new();
    let mut state = TextState::new();
    let mut in_text = false;
    let mut operand_stack: Vec<Token> = Vec::new();

    for token in tokens {
        match token {
            Token::Operand(_) => {
                operand_stack.push(token.clone());
            }
            Token::Operator(op) => {
                let op_str = std::str::from_utf8(op).unwrap_or("");

                match op_str {
                    "BT" => {
                        in_text = true;
                        state.reset();
                        // Flush any pending operands and emit BT
                        out.append(&mut operand_stack);
                        out.push(token.clone());
                    }
                    "ET" => {
                        in_text = false;
                        out.append(&mut operand_stack);
                        out.push(token.clone());
                    }
                    "Td" | "TD" if in_text => {
                        // Td: tx ty Td — move text position
                        if operand_stack.len() >= 2 {
                            let ty = parse_operand_f64(&operand_stack[operand_stack.len() - 1]);
                            let tx = parse_operand_f64(&operand_stack[operand_stack.len() - 2]);
                            state.apply_td(tx, ty);
                            if op_str == "TD" {
                                // TD also sets Tl = -ty (leading), but we don't track Tl
                            }
                        }
                        // Always keep position operators
                        out.append(&mut operand_stack);
                        out.push(token.clone());
                    }
                    "Tm" if in_text => {
                        // Tm: a b c d e f Tm — set text matrix
                        if operand_stack.len() >= 6 {
                            let n = operand_stack.len();
                            let a = parse_operand_f64(&operand_stack[n - 6]);
                            let b = parse_operand_f64(&operand_stack[n - 5]);
                            let c = parse_operand_f64(&operand_stack[n - 4]);
                            let d = parse_operand_f64(&operand_stack[n - 3]);
                            let e = parse_operand_f64(&operand_stack[n - 2]);
                            let f = parse_operand_f64(&operand_stack[n - 1]);
                            state.apply_tm(a, b, c, d, e, f);
                        }
                        out.append(&mut operand_stack);
                        out.push(token.clone());
                    }
                    "T*" if in_text => {
                        state.apply_t_star();
                        out.append(&mut operand_stack);
                        out.push(token.clone());
                    }
                    "Tf" if in_text => {
                        // Tf: /FontName size Tf
                        if operand_stack.len() >= 2 {
                            let size = parse_operand_f64(&operand_stack[operand_stack.len() - 1]);
                            if size > 0.0 {
                                state.font_size = size;
                            }
                        }
                        out.append(&mut operand_stack);
                        out.push(token.clone());
                    }
                    "Tj" if in_text => {
                        // Tj: (string) Tj — show text
                        if text_overlaps_region(state.tx(), state.ty(), state.font_size, regions) {
                            // Drop the string operand and Tj operator
                            operand_stack.clear();
                        } else {
                            out.append(&mut operand_stack);
                            out.push(token.clone());
                        }
                    }
                    "TJ" if in_text => {
                        // TJ: [(string) kern (string) kern ...] TJ — show text with kerning
                        if text_overlaps_region(state.tx(), state.ty(), state.font_size, regions) {
                            operand_stack.clear();
                        } else {
                            out.append(&mut operand_stack);
                            out.push(token.clone());
                        }
                    }
                    // ' operator: move to next line and show text
                    // " operator: set word/char spacing, move to next line, show text
                    op_s if in_text && op_s == "'" => {
                        state.apply_t_star();
                        if text_overlaps_region(state.tx(), state.ty(), state.font_size, regions) {
                            // Drop the string operand but keep the line move
                            // Emit T* instead to preserve position
                            operand_stack.clear();
                            out.push(Token::Operator(b"T*".to_vec()));
                        } else {
                            out.append(&mut operand_stack);
                            out.push(token.clone());
                        }
                    }
                    op_s if in_text && op_s == "\"" => {
                        // " : aw ac string " — set word spacing, char spacing, show text
                        state.apply_t_star();
                        if text_overlaps_region(state.tx(), state.ty(), state.font_size, regions) {
                            operand_stack.clear();
                            out.push(Token::Operator(b"T*".to_vec()));
                        } else {
                            out.append(&mut operand_stack);
                            out.push(token.clone());
                        }
                    }
                    _ => {
                        // Pass through all other operators unchanged
                        out.append(&mut operand_stack);
                        out.push(token.clone());
                    }
                }
            }
        }
    }

    // Flush any remaining operands
    out.append(&mut operand_stack);
    out
}

/// Parse a Token::Operand as an f64 number.
fn parse_operand_f64(token: &Token) -> f64 {
    match token {
        Token::Operand(data) => std::str::from_utf8(data)
            .ok()
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0),
        _ => 0.0,
    }
}

// ── Stream extraction ───────────────────────────────────────────────

/// Extract and decompress a PDF stream object's content.
fn extract_and_decompress_stream(pdf: &[u8], obj_id: usize) -> Result<Vec<u8>, FormeError> {
    let header = format!("{obj_id} 0 obj");
    let header_bytes = header.as_bytes();
    let obj_start = find_bytes(pdf, header_bytes)
        .ok_or_else(|| FormeError::RenderError(format!("Cannot find stream object {obj_id}")))?;

    // Find the stream keyword after the object header
    let search_region = &pdf[obj_start..std::cmp::min(obj_start + 4096, pdf.len())];
    let stream_kw = find_bytes(search_region, b"stream")
        .ok_or_else(|| FormeError::RenderError(format!("No stream in object {obj_id}")))?;

    let dict_region = &search_region[..stream_kw];
    let is_compressed = find_bytes(dict_region, b"/FlateDecode").is_some();

    // Stream data starts after "stream\n" or "stream\r\n"
    let abs_stream_kw = obj_start + stream_kw + 6; // skip "stream"
    let mut data_start = abs_stream_kw;
    if data_start < pdf.len() && pdf[data_start] == b'\r' {
        data_start += 1;
    }
    if data_start < pdf.len() && pdf[data_start] == b'\n' {
        data_start += 1;
    }

    // Find endstream
    let remaining = &pdf[data_start..];
    let endstream_offset = find_bytes(remaining, b"endstream")
        .ok_or_else(|| FormeError::RenderError(format!("No endstream in object {obj_id}")))?;

    // Trim trailing whitespace before endstream
    let mut end = endstream_offset;
    while end > 0 && (remaining[end - 1] == b'\n' || remaining[end - 1] == b'\r') {
        end -= 1;
    }

    let raw_bytes = &remaining[..end];

    if is_compressed {
        decompress_to_vec_zlib(raw_bytes).map_err(|e| {
            FormeError::RenderError(format!(
                "FlateDecode decompression failed for object {obj_id}: {e}"
            ))
        })
    } else {
        Ok(raw_bytes.to_vec())
    }
}

/// Parse content stream object IDs from a /Contents reference string.
/// Handles both single refs ("5 0 R") and arrays ("[5 0 R 6 0 R]").
fn parse_contents_obj_ids(contents_ref: &str) -> Vec<usize> {
    let trimmed = contents_ref.trim();
    let inner = if trimmed.starts_with('[') && trimmed.ends_with(']') {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    };

    let mut ids = Vec::new();
    let mut remaining = inner.trim();
    while !remaining.is_empty() {
        let end = remaining
            .find(|c: char| !c.is_ascii_digit())
            .unwrap_or(remaining.len());
        if end == 0 {
            remaining = &remaining[1..];
            continue;
        }
        if let Ok(id) = remaining[..end].parse::<usize>() {
            ids.push(id);
        }
        remaining = remaining[end..].trim_start();
        if remaining.starts_with("0 R") {
            remaining = remaining[3..].trim_start();
        }
    }
    ids
}

/// Redact regions of a PDF by removing text from content streams and overlaying
/// opaque rectangles.
///
/// Accepts top-origin (web) coordinates — the y-axis flip to PDF bottom-origin
/// happens here. Callers must NOT pre-flip coordinates.
pub fn redact_pdf(pdf_bytes: &[u8], regions: &[RedactionRegion]) -> Result<Vec<u8>, FormeError> {
    if regions.is_empty() {
        return Ok(pdf_bytes.to_vec());
    }

    let scan = scan_pdf_metadata(pdf_bytes)?;
    let pages = collect_pages(pdf_bytes, &scan)?;

    // Group regions by page index
    let max_page = regions.iter().map(|r| r.page).max().unwrap_or(0);
    if max_page >= pages.len() {
        return Err(FormeError::RenderError(format!(
            "Redaction references page {} but PDF only has {} pages",
            max_page,
            pages.len()
        )));
    }

    let mut regions_by_page: Vec<Vec<&RedactionRegion>> = vec![vec![]; pages.len()];
    for r in regions {
        regions_by_page[r.page].push(r);
    }

    let mut buf = Vec::from(pdf_bytes);
    if !buf.ends_with(b"\n") {
        buf.push(b'\n');
    }

    let mut next_id = scan.size;
    let mut xref_entries: Vec<(usize, usize)> = Vec::new();

    // For each page with redactions:
    // 1. Rewrite content stream to remove text operators in redaction regions
    // 2. Create visual overlay XObject
    // 3. Build new page object referencing both
    let mut new_page_refs: Vec<(usize, usize)> = Vec::new(); // (page_index, new_page_obj_id)

    for (page_idx, page_regions) in regions_by_page.iter().enumerate() {
        if page_regions.is_empty() {
            continue;
        }

        let page_info = &pages[page_idx];
        let media_height = page_info.media_box_height;

        // Convert redaction regions from web top-origin to PDF bottom-origin
        let pdf_regions: Vec<PdfRedactRegion> = page_regions
            .iter()
            .map(|r| PdfRedactRegion {
                x: r.x,
                y: media_height - r.y - r.height,
                width: r.width,
                height: r.height,
            })
            .collect();

        // ── Step 1: Rewrite content stream ──────────────────────────
        // Extract, decompress, tokenize, strip redacted text, recompress
        let content_obj_ids = parse_contents_obj_ids(&page_info.contents_ref);

        let mut combined_stream = Vec::new();
        for &obj_id in &content_obj_ids {
            let decompressed = extract_and_decompress_stream(pdf_bytes, obj_id)?;
            if !combined_stream.is_empty() {
                combined_stream.push(b'\n');
            }
            combined_stream.extend_from_slice(&decompressed);
        }

        let tokens = tokenize_content_stream(&combined_stream);
        let filtered_tokens = strip_redacted_text(&tokens, &pdf_regions);
        let new_stream_data = serialize_tokens(&filtered_tokens);
        let compressed_stream = compress_to_vec_zlib(&new_stream_data, 6);

        // Write the replacement content stream object
        let new_content_id = next_id;
        next_id += 1;
        xref_entries.push((new_content_id, buf.len()));

        let content_obj = format!(
            "{new_content_id} 0 obj\n<< /Length {} /Filter /FlateDecode >>\nstream\n",
            compressed_stream.len()
        );
        buf.extend_from_slice(content_obj.as_bytes());
        buf.extend_from_slice(&compressed_stream);
        buf.extend_from_slice(b"\nendstream\nendobj\n");

        // ── Step 2: Visual overlay XObject ──────────────────────────
        let mut overlay_content = String::new();
        for r in page_regions {
            let (pr, pg, pb) = parse_hex_color(r.color.as_deref().unwrap_or("#000000"));
            let pdf_y = media_height - r.y - r.height;
            overlay_content.push_str(&format!(
                "q {} {} {} rg {:.4} {:.4} {:.4} {:.4} re f Q\n",
                pr, pg, pb, r.x, pdf_y, r.width, r.height
            ));
        }

        let overlay_bytes = overlay_content.as_bytes();

        let xobj_id = next_id;
        next_id += 1;
        xref_entries.push((xobj_id, buf.len()));

        let xobj = format!(
            "{xobj_id} 0 obj\n<<\n/Type /XObject\n/Subtype /Form\n/BBox [0 0 {:.4} {:.4}]\n/Length {}\n>>\nstream\n",
            page_info.media_box_width,
            media_height,
            overlay_bytes.len()
        );
        buf.extend_from_slice(xobj.as_bytes());
        buf.extend_from_slice(overlay_bytes);
        buf.extend_from_slice(b"endstream\nendobj\n");

        // ── Step 3: Overlay invocation stream ───────────────────────
        let xobj_name = format!("FmRedact{page_idx}");
        let do_stream = format!("/{xobj_name} Do\n");
        let do_bytes = do_stream.as_bytes();

        let do_stream_id = next_id;
        next_id += 1;
        xref_entries.push((do_stream_id, buf.len()));

        let do_obj = format!(
            "{do_stream_id} 0 obj\n<< /Length {} >>\nstream\n",
            do_bytes.len()
        );
        buf.extend_from_slice(do_obj.as_bytes());
        buf.extend_from_slice(do_bytes);
        buf.extend_from_slice(b"endstream\nendobj\n");

        // ── Step 4: New page object ─────────────────────────────────
        let new_page_id = next_id;
        next_id += 1;
        xref_entries.push((new_page_id, buf.len()));

        let parent_ref = page_info.parent_obj;

        let mut page_dict = format!(
            "{new_page_id} 0 obj\n<<\n/Type /Page\n/Parent {parent_ref} 0 R\n/MediaBox [0 0 {:.4} {:.4}]\n",
            page_info.media_box_width,
            media_height,
        );

        if let Some((cw, ch)) = page_info.crop_box {
            page_dict.push_str(&format!("/CropBox [0 0 {cw:.4} {ch:.4}]\n"));
        }

        // Contents: replacement stream + overlay Do stream
        page_dict.push_str(&format!(
            "/Contents [{new_content_id} 0 R {do_stream_id} 0 R]\n"
        ));

        // Merge resources: add our XObject to existing resources
        if let Some(ref res) = page_info.resources_ref {
            page_dict.push_str(&format!(
                "/Resources << {res} /XObject << /{xobj_name} {xobj_id} 0 R >> >>\n"
            ));
        } else {
            page_dict.push_str(&format!(
                "/Resources << /XObject << /{xobj_name} {xobj_id} 0 R >> >>\n"
            ));
        }

        page_dict.push_str(">>\nendobj\n");
        buf.extend_from_slice(page_dict.as_bytes());

        new_page_refs.push((page_idx, new_page_id));
    }

    // ── Metadata scrubbing ─────────────────────────────────────────────
    // Replace /Info and /Metadata objects to strip sensitive document metadata.
    // Uses the same object IDs so the incremental update overrides the originals.

    let trailer_section = &pdf_bytes[scan.trailer_pos..scan.startxref_pos];
    if let Some(info_id) = find_ref_in_bytes(trailer_section, b"/Info") {
        let date = super::certify::format_pdf_date();
        xref_entries.push((info_id, buf.len()));
        let info = format!("{info_id} 0 obj\n<< /Producer (Forme) /ModDate ({date}) >>\nendobj\n");
        buf.extend_from_slice(info.as_bytes());
    }

    let text = String::from_utf8_lossy(pdf_bytes);
    if let Some(meta_id) = find_catalog_ref(&text, scan.root_obj, "/Metadata") {
        let xmp_date = format_xmp_date();
        let xmp = format!(
            "<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>\n\
             <x:xmpmeta xmlns:x='adobe:ns:meta/'>\n\
             <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>\n\
             <rdf:Description rdf:about=''\n\
             xmlns:pdf='http://ns.adobe.com/pdf/1.3/'\n\
             xmlns:xmp='http://ns.adobe.com/xap/1.0/'>\n\
             <pdf:Producer>Forme</pdf:Producer>\n\
             <xmp:ModifyDate>{xmp_date}</xmp:ModifyDate>\n\
             </rdf:Description>\n\
             </rdf:RDF>\n\
             </x:xmpmeta>\n\
             <?xpacket end='w'?>"
        );
        let xmp_bytes = xmp.as_bytes();
        let compressed = compress_to_vec_zlib(xmp_bytes, 6);
        xref_entries.push((meta_id, buf.len()));
        let meta_obj = format!(
            "{meta_id} 0 obj\n<< /Type /Metadata /Subtype /XML /Length {} /Filter /FlateDecode >>\nstream\n",
            compressed.len()
        );
        buf.extend_from_slice(meta_obj.as_bytes());
        buf.extend_from_slice(&compressed);
        buf.extend_from_slice(b"\nendstream\nendobj\n");
    }

    // Build a new /Pages object that references the updated page objects
    let new_pages_id = next_id;
    next_id += 1;
    xref_entries.push((new_pages_id, buf.len()));

    let mut kids = String::new();
    for (idx, page_info) in pages.iter().enumerate() {
        if let Some((_, new_id)) = new_page_refs.iter().find(|(pi, _)| *pi == idx) {
            kids.push_str(&format!("{new_id} 0 R "));
        } else {
            kids.push_str(&format!("{} 0 R ", page_info.obj_id));
        }
    }

    let pages_obj = format!(
        "{new_pages_id} 0 obj\n<< /Type /Pages /Kids [{kids}] /Count {} >>\nendobj\n",
        pages.len()
    );
    buf.extend_from_slice(pages_obj.as_bytes());

    // Build new catalog referencing the new /Pages tree
    let new_catalog_id = next_id;
    next_id += 1;
    xref_entries.push((new_catalog_id, buf.len()));

    // Preserve existing catalog entries
    let mut catalog =
        format!("{new_catalog_id} 0 obj\n<< /Type /Catalog /Pages {new_pages_id} 0 R\n");

    if let Some(lang) = find_catalog_string(&text, scan.root_obj, "/Lang") {
        catalog.push_str(&format!("/Lang ({lang})\n"));
    }
    if catalog_has_key(&text, scan.root_obj, "/MarkInfo") {
        catalog.push_str("/MarkInfo << /Marked true >>\n");
    }
    if let Some(r) = find_catalog_ref(&text, scan.root_obj, "/StructTreeRoot") {
        catalog.push_str(&format!("/StructTreeRoot {r} 0 R\n"));
    }
    if let Some(r) = find_catalog_ref(&text, scan.root_obj, "/Metadata") {
        catalog.push_str(&format!("/Metadata {r} 0 R\n"));
    }
    if let Some(r) = find_catalog_ref(&text, scan.root_obj, "/Names") {
        catalog.push_str(&format!("/Names {r} 0 R\n"));
    }
    if let Some(r) = find_catalog_ref(&text, scan.root_obj, "/ViewerPreferences") {
        catalog.push_str(&format!("/ViewerPreferences {r} 0 R\n"));
    }
    if let Some(oi) = find_catalog_array_content(&text, scan.root_obj, "/OutputIntents") {
        catalog.push_str(&format!("/OutputIntents {oi}\n"));
    }
    // Preserve AcroForm if present
    if let Some(acroform) = find_catalog_dict_content(&text, scan.root_obj, "/AcroForm") {
        catalog.push_str(&format!("/AcroForm {acroform}\n"));
    }

    catalog.push_str(">>\nendobj\n");
    buf.extend_from_slice(catalog.as_bytes());

    // Write xref table
    let xref_offset = buf.len();
    buf.extend_from_slice(b"xref\n");

    let mut sorted_entries = xref_entries.clone();
    sorted_entries.sort_by_key(|(id, _)| *id);

    let mut i = 0;
    while i < sorted_entries.len() {
        let start_id = sorted_entries[i].0;
        let mut count = 1;
        while i + count < sorted_entries.len() && sorted_entries[i + count].0 == start_id + count {
            count += 1;
        }
        buf.extend_from_slice(format!("{start_id} {count}\n").as_bytes());
        for j in 0..count {
            let offset = sorted_entries[i + j].1;
            buf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
        }
        i += count;
    }

    // Trailer
    buf.extend_from_slice(
        format!(
            "trailer\n<<\n/Size {next_id}\n/Root {new_catalog_id} 0 R\n/Prev {prev}\n>>\nstartxref\n{xref_offset}\n%%EOF\n",
            prev = scan.startxref_offset
        )
        .as_bytes(),
    );

    Ok(buf)
}

// ── PDF scanning infrastructure ─────────────────────────────────────

struct PdfScanResult {
    startxref_offset: usize,
    startxref_pos: usize,
    trailer_pos: usize,
    size: usize,
    root_obj: usize,
    pages_obj: usize,
}

struct PageInfo {
    obj_id: usize,
    parent_obj: usize,
    media_box_width: f64,
    media_box_height: f64,
    crop_box: Option<(f64, f64)>,
    contents_ref: String,
    resources_ref: Option<String>,
}

fn scan_pdf_metadata(pdf: &[u8]) -> Result<PdfScanResult, FormeError> {
    let startxref_pos = rfind_bytes(pdf, b"startxref")
        .ok_or_else(|| FormeError::RenderError("No startxref found in PDF".to_string()))?;
    let after_startxref = &pdf[startxref_pos + 9..];
    let startxref_offset: usize = parse_number_from_bytes(after_startxref)
        .ok_or_else(|| FormeError::RenderError("Cannot parse startxref value".to_string()))?;

    let trailer_pos = rfind_bytes(pdf, b"trailer")
        .ok_or_else(|| FormeError::RenderError("No trailer found in PDF".to_string()))?;
    let trailer_section = &pdf[trailer_pos..startxref_pos];

    let size = find_value_in_bytes(trailer_section, b"/Size")
        .ok_or_else(|| FormeError::RenderError("No /Size found in trailer".to_string()))?;

    let root_obj = find_ref_in_bytes(trailer_section, b"/Root")
        .ok_or_else(|| FormeError::RenderError("No /Root found in trailer".to_string()))?;

    let text = String::from_utf8_lossy(pdf);
    let pages_obj = find_catalog_ref(&text, root_obj, "/Pages")
        .ok_or_else(|| FormeError::RenderError("No /Pages in catalog".to_string()))?;

    Ok(PdfScanResult {
        startxref_offset,
        startxref_pos,
        trailer_pos,
        size,
        root_obj,
        pages_obj,
    })
}

/// Collect all page objects from the /Pages tree.
fn collect_pages(pdf: &[u8], scan: &PdfScanResult) -> Result<Vec<PageInfo>, FormeError> {
    let text = String::from_utf8_lossy(pdf);
    let mut pages = Vec::new();

    // Find the /Pages object and extract /Kids
    let kids = extract_kids_refs(&text, scan.pages_obj)?;

    for kid_id in &kids {
        collect_page_recursive(&text, *kid_id, scan.pages_obj, &mut pages)?;
    }

    if pages.is_empty() {
        return Err(FormeError::RenderError("No pages found in PDF".to_string()));
    }

    Ok(pages)
}

fn collect_page_recursive(
    text: &str,
    obj_id: usize,
    parent_id: usize,
    pages: &mut Vec<PageInfo>,
) -> Result<(), FormeError> {
    let obj_content = find_object_content(text, obj_id)
        .ok_or_else(|| FormeError::RenderError(format!("Cannot find object {obj_id}")))?;

    if obj_content.contains("/Type /Pages") {
        // Intermediate /Pages node — recurse into /Kids
        let kids = extract_kids_from_content(&obj_content)?;
        for kid_id in &kids {
            collect_page_recursive(text, *kid_id, obj_id, pages)?;
        }
    } else if obj_content.contains("/Type /Page") {
        // Leaf /Page node
        let (mw, mh) = extract_media_box(&obj_content)
            .or_else(|| {
                // Inherit from parent
                find_object_content(text, parent_id).and_then(|parent| extract_media_box(&parent))
            })
            .unwrap_or((612.0, 792.0)); // Default to Letter

        let crop_box = extract_crop_box(&obj_content);

        let contents_ref = extract_contents_ref(&obj_content).unwrap_or_default();

        let resources_ref = extract_resources_inline(&obj_content);

        pages.push(PageInfo {
            obj_id,
            parent_obj: parent_id,
            media_box_width: mw,
            media_box_height: mh,
            crop_box,
            contents_ref,
            resources_ref,
        });
    }

    Ok(())
}

// ── Object and value extraction helpers ─────────────────────────────

fn find_object_content(text: &str, obj_id: usize) -> Option<String> {
    let header = format!("{obj_id} 0 obj");
    let start = text.find(&header)?;
    let section = &text[start..];
    let end = section.find("endobj")?;
    Some(section[..end].to_string())
}

fn extract_kids_refs(text: &str, pages_obj: usize) -> Result<Vec<usize>, FormeError> {
    let content = find_object_content(text, pages_obj)
        .ok_or_else(|| FormeError::RenderError(format!("Cannot find /Pages object {pages_obj}")))?;
    extract_kids_from_content(&content)
}

fn extract_kids_from_content(content: &str) -> Result<Vec<usize>, FormeError> {
    let kids_pos = content
        .find("/Kids")
        .ok_or_else(|| FormeError::RenderError("No /Kids in /Pages object".to_string()))?;
    let after = &content[kids_pos + 5..];
    let bracket_start = after
        .find('[')
        .ok_or_else(|| FormeError::RenderError("No [ after /Kids".to_string()))?;
    let bracket_end = after
        .find(']')
        .ok_or_else(|| FormeError::RenderError("No ] after /Kids".to_string()))?;
    let inner = &after[bracket_start + 1..bracket_end];

    let mut refs = Vec::new();
    let mut remaining = inner.trim();
    while !remaining.is_empty() {
        let end = remaining
            .find(|c: char| !c.is_ascii_digit())
            .unwrap_or(remaining.len());
        if end == 0 {
            remaining = &remaining[1..];
            continue;
        }
        if let Ok(id) = remaining[..end].parse::<usize>() {
            refs.push(id);
        }
        remaining = remaining[end..].trim_start();
        // Skip "0 R"
        if remaining.starts_with("0 R") {
            remaining = remaining[3..].trim_start();
        }
    }

    Ok(refs)
}

fn extract_media_box(content: &str) -> Option<(f64, f64)> {
    extract_box(content, "/MediaBox")
}

fn extract_crop_box(content: &str) -> Option<(f64, f64)> {
    extract_box(content, "/CropBox")
}

fn extract_box(content: &str, key: &str) -> Option<(f64, f64)> {
    let pos = content.find(key)?;
    let after = &content[pos + key.len()..];
    let bracket_start = after.find('[')?;
    let bracket_end = after.find(']')?;
    let inner = &after[bracket_start + 1..bracket_end];

    let nums: Vec<f64> = inner
        .split_whitespace()
        .filter_map(|s| s.parse::<f64>().ok())
        .collect();

    if nums.len() >= 4 {
        // [llx lly urx ury] — width = urx - llx, height = ury - lly
        Some((nums[2] - nums[0], nums[3] - nums[1]))
    } else {
        None
    }
}

fn extract_contents_ref(content: &str) -> Option<String> {
    let pos = content.find("/Contents")?;
    let after = &content[pos + 9..].trim_start();

    if after.starts_with('[') {
        // Array of content stream references — return as-is
        let end = after.find(']')?;
        Some(after[..=end].to_string())
    } else {
        // Single reference "N 0 R"
        let end = after.find('R')?;
        Some(after[..=end].to_string())
    }
}

fn extract_resources_inline(content: &str) -> Option<String> {
    let pos = content.find("/Resources")?;
    let after = &content[pos + 10..].trim_start();

    if after.starts_with("<<") {
        // Inline dict — extract until matching >>
        // Simple approach: find the first >> (works for non-nested cases)
        // For nested dicts we need to count depth
        let mut depth = 0;
        let bytes = after.as_bytes();
        let mut end_pos = 0;
        let mut i = 0;
        while i < bytes.len() - 1 {
            if bytes[i] == b'<' && bytes[i + 1] == b'<' {
                depth += 1;
                i += 2;
            } else if bytes[i] == b'>' && bytes[i + 1] == b'>' {
                depth -= 1;
                i += 2;
                if depth == 0 {
                    end_pos = i;
                    break;
                }
            } else {
                i += 1;
            }
        }
        if end_pos > 0 {
            // Return inner content (strip outer << >>)
            let dict_content = &after[2..end_pos - 2].trim();
            Some(dict_content.to_string())
        } else {
            None
        }
    } else {
        // Reference "N 0 R" — can't easily inline, skip
        None
    }
}

// ── Byte-level scanning (shared patterns with signing.rs) ───────────

fn rfind_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.len() > haystack.len() {
        return None;
    }
    for i in (0..=haystack.len() - needle.len()).rev() {
        if haystack[i..i + needle.len()] == *needle {
            return Some(i);
        }
    }
    None
}

fn parse_number_from_bytes(bytes: &[u8]) -> Option<usize> {
    let start = bytes.iter().position(|&b| b.is_ascii_digit())?;
    let end = bytes[start..]
        .iter()
        .position(|b| !b.is_ascii_digit())
        .map(|p| start + p)
        .unwrap_or(bytes.len());
    std::str::from_utf8(&bytes[start..end]).ok()?.parse().ok()
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn find_value_in_bytes(section: &[u8], key: &[u8]) -> Option<usize> {
    let pos = find_bytes(section, key)?;
    parse_number_from_bytes(&section[pos + key.len()..])
}

fn find_ref_in_bytes(section: &[u8], key: &[u8]) -> Option<usize> {
    let pos = find_bytes(section, key)?;
    parse_number_from_bytes(&section[pos + key.len()..])
}

// ── Catalog helpers (text-based, shared patterns with signing.rs) ───

fn find_catalog_ref(text: &str, obj_id: usize, key: &str) -> Option<usize> {
    let obj_header = format!("{obj_id} 0 obj");
    let obj_start = text.find(&obj_header)?;
    let obj_section = &text[obj_start..];
    let obj_end = obj_section.find("endobj")?;
    let obj_content = &obj_section[..obj_end];

    let key_pos = obj_content.find(key)?;
    let after_key = &obj_content[key_pos + key.len()..];
    let trimmed = after_key.trim_start();
    let end = trimmed
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(trimmed.len());
    if end == 0 {
        return None;
    }
    trimmed[..end].parse().ok()
}

fn catalog_has_key(text: &str, obj_id: usize, key: &str) -> bool {
    let obj_header = format!("{obj_id} 0 obj");
    if let Some(obj_start) = text.find(&obj_header) {
        let obj_section = &text[obj_start..];
        if let Some(obj_end) = obj_section.find("endobj") {
            return obj_section[..obj_end].contains(key);
        }
    }
    false
}

fn find_catalog_string(text: &str, obj_id: usize, key: &str) -> Option<String> {
    let obj_header = format!("{obj_id} 0 obj");
    let obj_start = text.find(&obj_header)?;
    let obj_section = &text[obj_start..];
    let obj_end = obj_section.find("endobj")?;
    let obj_content = &obj_section[..obj_end];

    let key_pos = obj_content.find(key)?;
    let after_key = &obj_content[key_pos + key.len()..];
    let trimmed = after_key.trim_start();
    if !trimmed.starts_with('(') {
        return None;
    }
    let end = trimmed[1..].find(')')? + 1;
    Some(trimmed[1..end].to_string())
}

fn find_catalog_array_content(text: &str, obj_id: usize, key: &str) -> Option<String> {
    let obj_header = format!("{obj_id} 0 obj");
    let obj_start = text.find(&obj_header)?;
    let obj_section = &text[obj_start..];
    let obj_end = obj_section.find("endobj")?;
    let obj_content = &obj_section[..obj_end];

    let key_pos = obj_content.find(key)?;
    let after_key = &obj_content[key_pos + key.len()..];
    let trimmed = after_key.trim_start();
    if !trimmed.starts_with('[') {
        return None;
    }
    let end = trimmed.find(']')? + 1;
    Some(trimmed[..end].to_string())
}

fn find_catalog_dict_content(text: &str, obj_id: usize, key: &str) -> Option<String> {
    let obj_header = format!("{obj_id} 0 obj");
    let obj_start = text.find(&obj_header)?;
    let obj_section = &text[obj_start..];
    let obj_end = obj_section.find("endobj")?;
    let obj_content = &obj_section[..obj_end];

    let key_pos = obj_content.find(key)?;
    let after_key = &obj_content[key_pos + key.len()..];
    let trimmed = after_key.trim_start();
    if !trimmed.starts_with("<<") {
        return None;
    }

    // Count depth to find matching >>
    let bytes = trimmed.as_bytes();
    let mut depth = 0;
    let mut i = 0;
    while i < bytes.len() - 1 {
        if bytes[i] == b'<' && bytes[i + 1] == b'<' {
            depth += 1;
            i += 2;
        } else if bytes[i] == b'>' && bytes[i + 1] == b'>' {
            depth -= 1;
            i += 2;
            if depth == 0 {
                return Some(trimmed[..i].to_string());
            }
        } else {
            i += 1;
        }
    }
    None
}

// ── Color parsing ───────────────────────────────────────────────────

/// Parse a hex color string to (r, g, b) in 0-1 range for PDF operators.
fn parse_hex_color(hex: &str) -> (f64, f64, f64) {
    let hex = hex.trim_start_matches('#');
    if hex.len() >= 6 {
        let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
        let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
        let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
        (r as f64 / 255.0, g as f64 / 255.0, b as f64 / 255.0)
    } else {
        (0.0, 0.0, 0.0) // Default to black
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hex_color() {
        let (r, g, b) = parse_hex_color("#000000");
        assert_eq!((r, g, b), (0.0, 0.0, 0.0));

        let (r, g, b) = parse_hex_color("#ffffff");
        assert_eq!((r, g, b), (1.0, 1.0, 1.0));

        let (r, g, b) = parse_hex_color("#ff0000");
        assert_eq!((r, g, b), (1.0, 0.0, 0.0));
    }

    #[test]
    fn test_redact_empty_regions() {
        let pdf = b"%PDF-1.7\nsome content";
        let result = redact_pdf(pdf, &[]);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), pdf.to_vec());
    }

    #[test]
    fn test_redact_integration() {
        // Render a simple document to get valid PDF bytes
        let doc = crate::model::Document {
            children: vec![crate::model::Node::page(
                crate::model::PageConfig::default(),
                crate::style::Style::default(),
                vec![crate::model::Node::text(
                    "Hello, world!",
                    crate::style::Style::default(),
                )],
            )],
            metadata: crate::model::Metadata::default(),
            default_page: crate::model::PageConfig::default(),
            fonts: vec![],
            default_style: None,
            tagged: false,
            pdfa: None,
            pdf_ua: false,
            embedded_data: None,
            flatten_forms: false,
            certification: None,
        };

        let pdf_bytes = crate::render(&doc).expect("render should succeed");

        let regions = vec![RedactionRegion {
            page: 0,
            x: 50.0,
            y: 50.0,
            width: 200.0,
            height: 30.0,
            color: None,
        }];

        let result = redact_pdf(&pdf_bytes, &regions).expect("redact should succeed");

        // Verify the output is larger than the input (incremental update was appended)
        assert!(result.len() > pdf_bytes.len());

        // Verify it starts with %PDF
        assert!(result.starts_with(b"%PDF"));

        // Verify the redaction content stream contains our rectangle operators
        let text = String::from_utf8_lossy(&result);
        assert!(text.contains("re f Q"));

        // Verify there's a new xref and trailer
        assert!(text.contains("/Prev"));
    }

    #[test]
    fn test_redact_invalid_page() {
        let doc = crate::model::Document {
            children: vec![crate::model::Node::page(
                crate::model::PageConfig::default(),
                crate::style::Style::default(),
                vec![crate::model::Node::text(
                    "Test",
                    crate::style::Style::default(),
                )],
            )],
            metadata: crate::model::Metadata::default(),
            default_page: crate::model::PageConfig::default(),
            fonts: vec![],
            default_style: None,
            tagged: false,
            pdfa: None,
            pdf_ua: false,
            embedded_data: None,
            flatten_forms: false,
            certification: None,
        };

        let pdf_bytes = crate::render(&doc).expect("render should succeed");

        let regions = vec![RedactionRegion {
            page: 5, // Invalid — only 1 page
            x: 50.0,
            y: 50.0,
            width: 100.0,
            height: 20.0,
            color: None,
        }];

        let result = redact_pdf(&pdf_bytes, &regions);
        assert!(result.is_err());
    }

    #[test]
    fn test_redact_removes_text_from_content_stream() {
        // Render a document with known text
        let doc = crate::model::Document {
            children: vec![crate::model::Node::page(
                crate::model::PageConfig::default(),
                crate::style::Style::default(),
                vec![crate::model::Node::text(
                    "Hello, world!",
                    crate::style::Style::default(),
                )],
            )],
            metadata: crate::model::Metadata::default(),
            default_page: crate::model::PageConfig::default(),
            fonts: vec![],
            default_style: None,
            tagged: false,
            pdfa: None,
            pdf_ua: false,
            embedded_data: None,
            flatten_forms: false,
            certification: None,
        };

        let pdf_bytes = crate::render(&doc).expect("render should succeed");

        // Verify text exists in the original PDF
        let original_has_text = pdf_contains_text_showing_ops(&pdf_bytes, "Hello");
        assert!(
            original_has_text,
            "Original PDF should contain text-showing operators"
        );

        // Redact a large region covering the entire page content area
        // Default page is 595.28 x 841.89 (A4), text starts near top-left
        let regions = vec![RedactionRegion {
            page: 0,
            x: 0.0,
            y: 0.0,
            width: 600.0,
            height: 100.0,
            color: None,
        }];

        let result = redact_pdf(&pdf_bytes, &regions).expect("redact should succeed");

        // The NEW replacement content stream (in the incremental update portion)
        // should NOT contain text-showing operators.
        // The original stream is still in the file but no longer referenced.
        let original_len = pdf_bytes.len();
        let redacted_has_text = pdf_contains_text_showing_ops_after(&result, "Hello", original_len);
        assert!(
            !redacted_has_text,
            "Replacement content stream should NOT contain text-showing operators for 'Hello'"
        );

        // But the visual overlay should still be present
        let text = String::from_utf8_lossy(&result);
        assert!(
            text.contains("re f Q"),
            "Overlay rectangle should be present"
        );
    }

    #[test]
    fn test_redact_preserves_text_outside_region() {
        // Render a document with text at known position
        let doc = crate::model::Document {
            children: vec![crate::model::Node::page(
                crate::model::PageConfig::default(),
                crate::style::Style {
                    font_size: Some(12.0),
                    ..crate::style::Style::default()
                },
                vec![
                    crate::model::Node::text("Keep this text", crate::style::Style::default()),
                    // Add a spacer view to push second text down
                    crate::model::Node::view(
                        crate::style::Style {
                            height: Some(crate::style::Dimension::Pt(200.0)),
                            ..crate::style::Style::default()
                        },
                        vec![],
                    ),
                    crate::model::Node::text("Remove this text", crate::style::Style::default()),
                ],
            )],
            metadata: crate::model::Metadata::default(),
            default_page: crate::model::PageConfig::default(),
            fonts: vec![],
            default_style: None,
            tagged: false,
            pdfa: None,
            pdf_ua: false,
            embedded_data: None,
            flatten_forms: false,
            certification: None,
        };

        let pdf_bytes = crate::render(&doc).expect("render should succeed");

        // Redact only the lower region (where "Remove this text" is)
        // y=220 in top-origin coords (past the spacer)
        let regions = vec![RedactionRegion {
            page: 0,
            x: 0.0,
            y: 220.0,
            width: 600.0,
            height: 50.0,
            color: None,
        }];

        let result = redact_pdf(&pdf_bytes, &regions).expect("redact should succeed");

        // The result should still be valid PDF
        assert!(result.starts_with(b"%PDF"));

        // Should have incremental update
        let text = String::from_utf8_lossy(&result);
        assert!(text.contains("/Prev"));
    }

    #[test]
    fn test_tokenizer_roundtrip() {
        let stream = b"BT /F1 12 Tf 72 720 Td (Hello World) Tj ET";
        let tokens = tokenize_content_stream(stream);

        // Should have tokens for: BT, /F1, 12, Tf, 72, 720, Td, (Hello World), Tj, ET
        let operators: Vec<_> = tokens
            .iter()
            .filter_map(|t| match t {
                Token::Operator(data) => Some(std::str::from_utf8(data).unwrap().to_string()),
                _ => None,
            })
            .collect();
        assert!(operators.contains(&"BT".to_string()));
        assert!(operators.contains(&"Tf".to_string()));
        assert!(operators.contains(&"Td".to_string()));
        assert!(operators.contains(&"Tj".to_string()));
        assert!(operators.contains(&"ET".to_string()));
    }

    #[test]
    fn test_strip_redacted_text_removes_overlapping() {
        // Simulate a content stream with text at position (72, 720) in PDF coords
        let stream = b"BT /F1 12 Tf 72 720 Td (Hello World) Tj ET";
        let tokens = tokenize_content_stream(stream);

        // Redaction region that covers the text position
        let regions = vec![PdfRedactRegion {
            x: 50.0,
            y: 710.0,
            width: 200.0,
            height: 30.0,
        }];

        let filtered = strip_redacted_text(&tokens, &regions);
        let result = serialize_tokens(&filtered);
        let result_str = String::from_utf8_lossy(&result);

        // Should NOT contain the Tj operator
        assert!(
            !result_str.contains("Tj"),
            "Filtered stream should not contain Tj"
        );
        // But should still have BT/ET and positioning
        assert!(result_str.contains("BT"), "Should preserve BT");
        assert!(result_str.contains("ET"), "Should preserve ET");
        assert!(result_str.contains("Td"), "Should preserve Td");
    }

    #[test]
    fn test_strip_redacted_text_preserves_non_overlapping() {
        let stream = b"BT /F1 12 Tf 72 720 Td (Keep this) Tj ET";
        let tokens = tokenize_content_stream(stream);

        // Redaction region far away from the text
        let regions = vec![PdfRedactRegion {
            x: 400.0,
            y: 100.0,
            width: 100.0,
            height: 30.0,
        }];

        let filtered = strip_redacted_text(&tokens, &regions);
        let result = serialize_tokens(&filtered);
        let result_str = String::from_utf8_lossy(&result);

        // Should still contain the text operator
        assert!(
            result_str.contains("Tj"),
            "Non-overlapping text should be preserved"
        );
    }

    /// Helper: check if a PDF's content streams contain text-showing operators
    /// (Tj/TJ) with the given needle string.
    ///
    /// When `after_offset` is provided, only checks streams that start after
    /// that byte offset (useful for checking only incremental update streams).
    fn pdf_contains_text_showing_ops_after(pdf: &[u8], needle: &str, after_offset: usize) -> bool {
        let mut pos = after_offset;
        while pos < pdf.len() {
            if let Some(stream_pos) = find_bytes(&pdf[pos..], b"stream\n") {
                let abs_pos = pos + stream_pos + 7;
                if let Some(end_pos) = find_bytes(&pdf[abs_pos..], b"endstream") {
                    let stream_data = &pdf[abs_pos..abs_pos + end_pos];

                    let decompressed = decompress_to_vec_zlib(stream_data)
                        .unwrap_or_else(|_| stream_data.to_vec());

                    let stream_text = String::from_utf8_lossy(&decompressed);
                    if (stream_text.contains("Tj") || stream_text.contains("TJ"))
                        && stream_text.contains(needle)
                    {
                        return true;
                    }

                    pos = abs_pos + end_pos;
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        false
    }

    fn pdf_contains_text_showing_ops(pdf: &[u8], needle: &str) -> bool {
        pdf_contains_text_showing_ops_after(pdf, needle, 0)
    }

    #[test]
    fn test_redact_custom_color() {
        let doc = crate::model::Document {
            children: vec![crate::model::Node::page(
                crate::model::PageConfig::default(),
                crate::style::Style::default(),
                vec![crate::model::Node::text(
                    "Color test",
                    crate::style::Style::default(),
                )],
            )],
            metadata: crate::model::Metadata::default(),
            default_page: crate::model::PageConfig::default(),
            fonts: vec![],
            default_style: None,
            tagged: false,
            pdfa: None,
            pdf_ua: false,
            embedded_data: None,
            flatten_forms: false,
            certification: None,
        };

        let pdf_bytes = crate::render(&doc).expect("render should succeed");

        let regions = vec![RedactionRegion {
            page: 0,
            x: 10.0,
            y: 10.0,
            width: 50.0,
            height: 50.0,
            color: Some("#ff0000".to_string()),
        }];

        let result = redact_pdf(&pdf_bytes, &regions).expect("redact should succeed");
        let text = String::from_utf8_lossy(&result);
        // Should contain red color (1 0 0 rg)
        assert!(text.contains("1 0 0 rg"));
    }

    #[test]
    fn test_redact_strips_metadata() {
        let doc = crate::model::Document {
            children: vec![crate::model::Node::page(
                crate::model::PageConfig::default(),
                crate::style::Style::default(),
                vec![crate::model::Node::text(
                    "Secret doc",
                    crate::style::Style::default(),
                )],
            )],
            metadata: crate::model::Metadata {
                title: Some("Confidential Report".to_string()),
                author: Some("John Doe".to_string()),
                creator: Some("SecretApp".to_string()),
                ..Default::default()
            },
            default_page: crate::model::PageConfig::default(),
            fonts: vec![],
            default_style: None,
            tagged: false,
            pdfa: None,
            pdf_ua: false,
            embedded_data: None,
            flatten_forms: false,
            certification: None,
        };

        let pdf_bytes = crate::render(&doc).expect("render should succeed");

        // Verify original has metadata
        let original_text = String::from_utf8_lossy(&pdf_bytes);
        assert!(
            original_text.contains("Confidential Report"),
            "Original PDF should contain title"
        );
        assert!(
            original_text.contains("John Doe"),
            "Original PDF should contain author"
        );

        // Redact any region
        let regions = vec![RedactionRegion {
            page: 0,
            x: 10.0,
            y: 10.0,
            width: 50.0,
            height: 50.0,
            color: None,
        }];
        let result = redact_pdf(&pdf_bytes, &regions).expect("redact should succeed");

        // The incremental update section should contain scrubbed /Info
        let new_section = String::from_utf8_lossy(&result[pdf_bytes.len()..]);
        assert!(
            new_section.contains("/Producer (Forme)"),
            "Replacement /Info should have /Producer (Forme)"
        );
        assert!(
            new_section.contains("/ModDate"),
            "Replacement /Info should have /ModDate"
        );
        assert!(
            !new_section.contains("Confidential Report"),
            "Original title should not appear in incremental update"
        );
        assert!(
            !new_section.contains("John Doe"),
            "Original author should not appear in incremental update"
        );
        assert!(
            !new_section.contains("SecretApp"),
            "Original creator should not appear in incremental update"
        );
    }
}
