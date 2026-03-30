import { Document, Page, View, Text, Fixed } from '@formepdf/react';

export default (
    <Document title="0.8.1 Fixes Demo" lang="en">
      {/* Page 1: Latin Extended character fix */}
      <Page size="A4" margin={60}>
        <Fixed position="footer">
          <View style={{ flexDirection: 'row', padding: '0 0 20 0' }}>
            <Text style={{ fontSize: 9, color: '#94a3b8' }}>{"Page {{pageNumber}} of {{totalPages}}"}</Text>
            <Text style={{ fontSize: 9, color: '#94a3b8' }}>Forme 0.8.1 Fixes Demo</Text>
          </View>
        </Fixed>

        <Text style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Fix 1: Latin Extended Characters</Text>
        <Text style={{ fontSize: 11, color: '#64748b', marginBottom: 20 }}>
          Previously, accented characters had wrong advance widths and rendered stacked on top of each other.
          Now they space correctly with the same width as their base character.
        </Text>

        {/* Swedish */}
        <View style={{ marginBottom: 16, padding: 16, backgroundColor: '#f8fafc', borderRadius: 4 }}>
          <Text style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Swedish</Text>
          <Text style={{ fontSize: 16 }}>Räksmörgås med dillmajonnäs — Ålands skärgård</Text>
          <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Characters: Ä Å Ö ä å ö</Text>
        </View>

        {/* German */}
        <View style={{ marginBottom: 16, padding: 16, backgroundColor: '#f8fafc', borderRadius: 4 }}>
          <Text style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>German</Text>
          <Text style={{ fontSize: 16 }}>Größenänderung der Überwachungsgeräte für Straßenverkehr</Text>
          <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Characters: Ä Ö Ü ä ö ü ß</Text>
        </View>

        {/* French */}
        <View style={{ marginBottom: 16, padding: 16, backgroundColor: '#f8fafc', borderRadius: 4 }}>
          <Text style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>French</Text>
          <Text style={{ fontSize: 16 }}>Crème brûlée à la française — où est le café?</Text>
          <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Characters: À É È Ê Ë Ç Î Ô Ù à é è ê ë ç î ô ù</Text>
        </View>

        {/* Spanish */}
        <View style={{ marginBottom: 16, padding: 16, backgroundColor: '#f8fafc', borderRadius: 4 }}>
          <Text style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Spanish</Text>
          <Text style={{ fontSize: 16 }}>El niño pidió más información — ¿Cómo está usted?</Text>
          <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Characters: Á É Í Ó Ú Ñ Ü á é í ó ú ñ ü ¿ ¡</Text>
        </View>

        {/* Nordic */}
        <View style={{ marginBottom: 16, padding: 16, backgroundColor: '#f8fafc', borderRadius: 4 }}>
          <Text style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Danish / Norwegian / Icelandic</Text>
          <Text style={{ fontSize: 16 }}>Blåbær og rødgrød med fløde — Þórhildur frá Ísafirði</Text>
          <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Characters: Æ Ø Å æ ø å Þ ð</Text>
        </View>

        {/* Full Latin Extended showcase */}
        <View style={{ marginTop: 8, padding: 16, border: '1px solid #e2e8f0', borderRadius: 4 }}>
          <Text style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Full Latin Extended (WinAnsi 0xC0-0xFF)</Text>
          <Text style={{ fontSize: 14 }}>À Á Â Ã Ä Å Æ Ç È É Ê Ë Ì Í Î Ï Ð Ñ Ò Ó Ô Õ Ö × Ø Ù Ú Û Ü Ý Þ ß</Text>
          <Text style={{ fontSize: 14, marginTop: 4 }}>à á â ã ä å æ ç è é ê ë ì í î ï ð ñ ò ó ô õ ö ÷ ø ù ú û ü ý þ ÿ</Text>
        </View>
      </Page>

      {/* Page 2: Page number placeholder fix */}
      <Page size="A4" margin={60}>
        <Fixed position="bottom">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: '0 0 20 0' }}>
            <Text style={{ fontSize: 9, color: '#94a3b8' }}>Forme 0.8.1 Fixes Demo</Text>
            <Text style={{ fontSize: 9, color: '#94a3b8' }}>{"Page {{pageNumber}} of {{totalPages}}"}</Text>
          </View>
        </Fixed>

        <Text style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Fix 2: Page Number Placeholder Width</Text>
        <Text style={{ fontSize: 11, color: '#64748b', marginBottom: 20 }}>
          Previously, {'{{pageNumber}}'} and {'{{totalPages}}'} were measured as 14-16 character literal strings during
          layout, but replaced with short numbers like "1" or "2" during PDF generation. This caused huge gaps
          in flex rows. Now they measure as "00" during layout — matching actual rendered width.
        </Text>

        {/* Demo: page numbers in flex rows */}
        <Text style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Page numbers in flex rows:</Text>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <View style={{ backgroundColor: '#3b82f6', padding: '8 16', borderRadius: 4 }}>
            <Text style={{ fontSize: 12, color: '#ffffff' }}>{'{{pageNumber}}'}</Text>
          </View>
          <Text style={{ fontSize: 12 }}>of</Text>
          <View style={{ backgroundColor: '#3b82f6', padding: '8 16', borderRadius: 4 }}>
            <Text style={{ fontSize: 12, color: '#ffffff' }}>{'{{totalPages}}'}</Text>
          </View>
          <Text style={{ fontSize: 12, color: '#64748b' }}>— no extra gap between elements</Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#f8fafc', borderRadius: 4, marginBottom: 12 }}>
          <Text style={{ fontSize: 12 }}>Document Section A</Text>
          <Text style={{ fontSize: 12, color: '#64748b' }}>Page {'{{pageNumber}}'}/{'{{totalPages}}'}</Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#f8fafc', borderRadius: 4, marginBottom: 12 }}>
          <Text style={{ fontSize: 12 }}>Document Section B</Text>
          <Text style={{ fontSize: 12, color: '#64748b' }}>Page {'{{pageNumber}}'}/{'{{totalPages}}'}</Text>
        </View>

        {/* Demo: inline with other text */}
        <Text style={{ fontSize: 14, fontWeight: 700, marginTop: 20, marginBottom: 12 }}>Inline with text:</Text>

        <View style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 4, marginBottom: 12 }}>
          <Text style={{ fontSize: 12 }}>This is page {'{{pageNumber}}'} of {'{{totalPages}}'} in the document. The text should flow naturally without large gaps around the numbers.</Text>
        </View>

        <View style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 4 }}>
          <Text style={{ fontSize: 12 }}>Report generated on March 30, 2026 — Page {'{{pageNumber}}'} of {'{{totalPages}}'}</Text>
        </View>
      </Page>
    </Document>
);
