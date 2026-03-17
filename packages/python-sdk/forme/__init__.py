"""Forme Python SDK — client for the Forme hosted PDF API and local rendering."""

from .client import Forme, FormeError
from .templates import (
    Document,
    Page,
    View,
    Text,
    Image,
    Table,
    Row,
    Cell,
    Svg,
    QrCode,
    PageBreak,
    Fixed,
    Watermark,
)

__all__ = [
    # API client
    "Forme",
    "FormeError",
    # Template components
    "Document",
    "Page",
    "View",
    "Text",
    "Image",
    "Table",
    "Row",
    "Cell",
    "Svg",
    "QrCode",
    "PageBreak",
    "Fixed",
    "Watermark",
]
