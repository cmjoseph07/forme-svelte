//! # 1D Barcode Generation
//!
//! Converts data strings into barcode bar patterns for vector rendering in PDF.
//! Uses the `barcoders` crate for encoding. Each barcode format produces a
//! `Vec<u8>` of 0/1 values representing spaces and bars.

use barcoders::sym::codabar::Codabar;
use barcoders::sym::code128::Code128;
use barcoders::sym::code39::Code39;
use barcoders::sym::ean13::EAN13;
use barcoders::sym::ean8::EAN8;

/// Supported barcode formats.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
pub enum BarcodeFormat {
    #[default]
    Code128,
    Code39,
    #[serde(rename = "EAN13")]
    Ean13,
    #[serde(rename = "EAN8")]
    Ean8,
    Codabar,
}

/// A 1D barcode represented as a sequence of bar/space values.
#[derive(Debug, Clone)]
pub struct BarcodeData {
    /// Each element is 0 (space) or 1 (bar).
    pub bars: Vec<u8>,
}

/// Generate a barcode from the given data string and format.
pub fn generate_barcode(data: &str, format: BarcodeFormat) -> Result<BarcodeData, String> {
    let bars = match format {
        BarcodeFormat::Code128 => {
            // barcoders requires a start character: 'Ɓ' = Set B (standard ASCII).
            // Auto-prepend if the user didn't provide one.
            let input = if data.starts_with('À') || data.starts_with('Ɓ') || data.starts_with('Ć')
            {
                data.to_string()
            } else {
                format!("Ɓ{data}")
            };
            let barcode = Code128::new(&input).map_err(|e| format!("Code128 error: {e}"))?;
            barcode.encode()
        }
        BarcodeFormat::Code39 => {
            let barcode = Code39::new(data).map_err(|e| format!("Code39 error: {e}"))?;
            barcode.encode()
        }
        BarcodeFormat::Ean13 => {
            let barcode = EAN13::new(data).map_err(|e| format!("EAN13 error: {e}"))?;
            barcode.encode()
        }
        BarcodeFormat::Ean8 => {
            let barcode = EAN8::new(data).map_err(|e| format!("EAN8 error: {e}"))?;
            barcode.encode()
        }
        BarcodeFormat::Codabar => {
            let barcode = Codabar::new(data).map_err(|e| format!("Codabar error: {e}"))?;
            barcode.encode()
        }
    };

    Ok(BarcodeData { bars })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_code128() {
        let bc = generate_barcode("Hello", BarcodeFormat::Code128).unwrap();
        assert!(!bc.bars.is_empty());
        assert!(bc.bars.iter().all(|&b| b == 0 || b == 1));
    }

    #[test]
    fn test_code39() {
        let bc = generate_barcode("HELLO", BarcodeFormat::Code39).unwrap();
        assert!(!bc.bars.is_empty());
    }

    #[test]
    fn test_ean13() {
        let bc = generate_barcode("5901234123457", BarcodeFormat::Ean13).unwrap();
        assert!(!bc.bars.is_empty());
    }

    #[test]
    fn test_ean8() {
        let bc = generate_barcode("65833254", BarcodeFormat::Ean8).unwrap();
        assert!(!bc.bars.is_empty());
    }

    #[test]
    fn test_invalid_ean13() {
        let result = generate_barcode("123", BarcodeFormat::Ean13);
        assert!(result.is_err());
    }

    #[test]
    fn test_bars_contain_dark() {
        let bc = generate_barcode("Test", BarcodeFormat::Code128).unwrap();
        assert!(bc.bars.contains(&1), "Should have dark bars");
    }
}
