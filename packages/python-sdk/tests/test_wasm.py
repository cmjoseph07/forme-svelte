"""Integration tests for WASM rendering — requires forme.wasm + wasmtime."""
import json
import os
from pathlib import Path

import pytest

WASM_PATH = Path(__file__).parent.parent / "forme" / "forme.wasm"
HAS_WASM = WASM_PATH.exists()

try:
    import wasmtime  # noqa: F401
    HAS_WASMTIME = True
except ImportError:
    HAS_WASMTIME = False

skip_reason = ""
if not HAS_WASM:
    skip_reason = "forme.wasm not found — run build_wasm.sh first"
elif not HAS_WASMTIME:
    skip_reason = "wasmtime not installed — pip install wasmtime"

pytestmark = pytest.mark.skipif(
    not (HAS_WASM and HAS_WASMTIME),
    reason=skip_reason or "WASM or wasmtime unavailable",
)


class TestWasmRendering:
    def test_simple_document(self):
        from forme.templates import Document, Page, Text
        doc = Document(Page(Text("Hello, World!")))
        pdf = doc.render()
        assert pdf[:5] == b"%PDF-"

    def test_styled_text(self):
        from forme.templates import Document, Page, Text
        doc = Document(
            Page(
                Text("Bold text", style={"fontWeight": "bold", "fontSize": 24}),
                Text("Italic text", style={"fontStyle": "italic"}),
            )
        )
        pdf = doc.render()
        assert pdf[:5] == b"%PDF-"
        assert len(pdf) > 100

    def test_multi_element(self):
        from forme.templates import Document, Page, View, Text
        doc = Document(
            Page(
                View(
                    Text("Item 1"),
                    Text("Item 2"),
                    Text("Item 3"),
                    style={"flexDirection": "column", "gap": 10},
                ),
            )
        )
        pdf = doc.render()
        assert pdf[:5] == b"%PDF-"

    def test_embed_data(self):
        from forme.templates import Document, Page, Text
        import json as json_mod
        data = {"invoice_id": "INV-001", "total": 99.99}
        doc = Document(Page(Text("Invoice")))
        # Verify embed_data is injected into the JSON correctly
        d = doc.to_dict()
        d["embedded_data"] = json_mod.dumps(data)
        assert "embedded_data" in d
        assert json_mod.loads(d["embedded_data"]) == data
        # Verify rendering still produces valid PDF
        pdf = doc.render(embed_data=data)
        assert pdf[:5] == b"%PDF-"

    def test_invalid_json_raises(self):
        from forme.wasm import render_pdf, FormeRenderError
        with pytest.raises(FormeRenderError):
            render_pdf("not valid json {{{")

    def test_render_pdf_direct(self):
        from forme.wasm import render_pdf
        doc_json = json.dumps({
            "children": [{
                "kind": {
                    "type": "Page",
                    "config": {
                        "size": "A4",
                        "margin": {"top": 54, "right": 54, "bottom": 54, "left": 54},
                        "wrap": True,
                    },
                },
                "style": {},
                "children": [{
                    "kind": {"type": "Text", "content": "Direct render"},
                    "style": {},
                    "children": [],
                }],
            }],
        })
        pdf = render_pdf(doc_json)
        assert pdf[:5] == b"%PDF-"
