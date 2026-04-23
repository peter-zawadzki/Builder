import { useState, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrailRow { id: number; name: string; qty: string; notes: string; unitPrice: string; }
interface ReqRow   { id: number; location: string; requirement: string; details: string; responsibility: string; }
interface BulkRow  { id: number; passType: string; qty: string; unitPrice: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _uid = 0;
const uid = () => ++_uid;
const parseAmt = (v: string) => parseFloat((v || '').replace(/[$,]/g, '')) || 0;
const fmtNum   = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtDate  = (d: string) => { if (!d) return '[Date]'; const [y, m, day] = d.split('-'); return `${m}/${day}/${y}`; };
const today    = () => new Date().toISOString().split('T')[0];
const in30days = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; };

// ─── ProposalBuilder ──────────────────────────────────────────────────────────

export function ProposalBuilder() {
  // Proposal info
  const [propNum,   setPropNum]   = useState('YLR-2026-001');
  const [propDate,  setPropDate]  = useState<string>(today);
  const [propValid, setPropValid] = useState<string>(in30days);

  // Client
  const [clientName,  setClientName]  = useState('Pleasant Mountain');
  const [mountainName,setMountainName]= useState('Pleasant Mountain');
  const [clientAddr,  setClientAddr]  = useState('119 Mountain Road, Bridgton, Maine 04009');

  // Trails
  const [trails, setTrails] = useState<TrailRow[]>([
    { id: uid(), name: '', qty: '', notes: '', unitPrice: '1000' },
  ]);

  // Install notes
  const [installDays,  setInstallDays]  = useState('');
  const [installNotes, setInstallNotes] = useState('');

  // Site requirements
  const [reqs, setReqs] = useState<ReqRow[]>([
    { id: uid(), location: 'Summit',        requirement: 'Power Supply',     details: '120V AC within 2m of mount point',                          responsibility: 'Client' },
    { id: uid(), location: 'All Locations', requirement: 'Network / Internet',details: 'Stable broadband, min. 10Mbps upload per camera',           responsibility: 'Client' },
    { id: uid(), location: 'All Locations', requirement: 'Mounting Surface',  details: 'Solid timber, steel pole, or concrete rated for wind load', responsibility: 'Client' },
    { id: uid(), location: 'All Locations', requirement: 'Site Access',        details: 'Unrestricted access to all trail locations on install day', responsibility: 'Client' },
  ]);

  // Quote
  const [qIntegration, setQIntegration] = useState('');
  const [qInstall,     setQInstall]     = useState('');
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([
    { id: uid(), passType: 'Day Passes',      qty: '', unitPrice: '10'  },
    { id: uid(), passType: 'Mountain Passes', qty: '', unitPrice: '75'  },
    { id: uid(), passType: 'Season Passes',   qty: '', unitPrice: '100' },
  ]);
  const [qMisc,     setQMisc]     = useState('');
  const [qPayment,  setQPayment]  = useState('50% deposit is due upon execution of the Customer Agreement. The remaining 50% balance is due on or before November 1, 2026.');
  const [termsExtra,setTermsExtra]= useState('');

  // View
  const [showPreview, setShowPreview] = useState(false);

  // Computed totals
  const trailSubtotal = trails.reduce((s, r) => s + (parseFloat(r.qty) || 0) * parseAmt(r.unitPrice), 0);
  const bulkSubtotal  = bulkRows.reduce((s, r) => { const q = parseFloat(r.qty)||0; const u = parseAmt(r.unitPrice); return s + (q&&u ? q*u : 0); }, 0);
  const hwTotal       = trailSubtotal + parseAmt(qIntegration) + parseAmt(qInstall) + parseAmt(qMisc);

  // Trail helpers
  const updateTrail = (id: number, f: keyof TrailRow, v: string) => setTrails(rs => rs.map(r => r.id===id ? {...r,[f]:v} : r));
  const addTrail    = () => setTrails(rs => [...rs, { id: uid(), name:'', qty:'', notes:'', unitPrice:'1000' }]);
  const removeTrail = (id: number) => setTrails(rs => rs.filter(r => r.id!==id));

  // Req helpers
  const updateReq = (id: number, f: keyof ReqRow, v: string) => setReqs(rs => rs.map(r => r.id===id ? {...r,[f]:v} : r));
  const addReq    = () => setReqs(rs => [...rs, { id: uid(), location:'', requirement:'', details:'', responsibility:'' }]);
  const removeReq = (id: number) => setReqs(rs => rs.filter(r => r.id!==id));

  // Bulk helpers
  const updateBulk = (id: number, f: keyof BulkRow, v: string) => setBulkRows(rs => rs.map(r => r.id===id ? {...r,[f]:v} : r));
  const addBulk    = () => setBulkRows(rs => [...rs, { id: uid(), passType:'', qty:'', unitPrice:'' }]);
  const removeBulk = (id: number) => setBulkRows(rs => rs.filter(r => r.id!==id));

  if (showPreview) {
    return (
      <ProposalPreview
        propNum={propNum} propDate={propDate} propValid={propValid}
        clientName={clientName} mountainName={mountainName} clientAddr={clientAddr}
        installDays={installDays} installNotes={installNotes}
        trails={trails} reqs={reqs} bulkRows={bulkRows}
        qIntegration={qIntegration} qInstall={qInstall} qMisc={qMisc}
        qPayment={qPayment} termsExtra={termsExtra}
        trailSubtotal={trailSubtotal} bulkSubtotal={bulkSubtotal} hwTotal={hwTotal}
        onBack={() => setShowPreview(false)}
      />
    );
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 13, color: '#1a1a1a', background: '#f4f4f4', minHeight: '100vh' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: 24 }}>

        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#FF5C39', marginBottom: 4 }}>YULLR Proposal Builder</h1>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 24 }}>Fill in the fields below, then click Generate Proposal.</p>

        {/* ── Proposal Info ── */}
        <Section title="Proposal Info">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Proposal #"><input style={inp} value={propNum} onChange={e => setPropNum(e.target.value)} placeholder="YLR-2026-001" /></Field>
            <Field label="Date"><input style={inp} type="date" value={propDate} onChange={e => setPropDate(e.target.value)} /></Field>
          </div>
          <div style={{ maxWidth: '50%' }}>
            <Field label="Valid Until"><input style={inp} type="date" value={propValid} onChange={e => setPropValid(e.target.value)} /></Field>
          </div>
        </Section>

        {/* ── Client Details ── */}
        <Section title="Client Details">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Client / Company Name"><input style={inp} value={clientName} onChange={e => setClientName(e.target.value)} /></Field>
            <Field label="Mountain Name"><input style={inp} value={mountainName} onChange={e => setMountainName(e.target.value)} /></Field>
          </div>
          <Field label="Site Address"><input style={inp} value={clientAddr} onChange={e => setClientAddr(e.target.value)} /></Field>
        </Section>

        {/* ── Trails ── */}
        <Section title="Trails / Capture Points">
          <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 2.5fr 1fr 1fr 28px', gap: 8, marginBottom: 4 }}>
            {['Trail Name','Capture Points','Notes','Unit Price','Total',''].map((h,i) => (
              <span key={i} style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>
          {trails.map(r => {
            const total = (parseFloat(r.qty)||0) * parseAmt(r.unitPrice);
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 2.5fr 1fr 1fr 28px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input style={inp} value={r.name}      onChange={e => updateTrail(r.id,'name',e.target.value)}      placeholder="Trail name" />
                <input style={inp} type="number" min="1" value={r.qty} onChange={e => updateTrail(r.id,'qty',e.target.value)} placeholder="1" />
                <input style={inp} value={r.notes}     onChange={e => updateTrail(r.id,'notes',e.target.value)}     placeholder="Notes" />
                <input style={inp} value={r.unitPrice} onChange={e => updateTrail(r.id,'unitPrice',e.target.value)} placeholder="1000" />
                <input style={{...inp, background:'#f0f0f0'}} value={total > 0 ? fmtNum(total) : ''} readOnly />
                <BtnRemove onClick={() => removeTrail(r.id)} />
              </div>
            );
          })}
          <BtnAdd onClick={addTrail}>+ Add Trail</BtnAdd>
        </Section>

        {/* ── Installation Notes ── */}
        <Section title="Installation Notes">
          <Field label="Estimated Install Duration"><input style={inp} value={installDays} onChange={e => setInstallDays(e.target.value)} placeholder="e.g. 2 days" /></Field>
          <Field label="Additional Notes (one per line)"><textarea style={ta} value={installNotes} onChange={e => setInstallNotes(e.target.value)} placeholder="e.g. All installs during non-operational hours" /></Field>
        </Section>

        {/* ── Site Requirements ── */}
        <Section title="Site Requirements">
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 2fr 1fr 28px', gap: 8, marginBottom: 4 }}>
            {['Location','Requirement','Details','Responsibility',''].map((h,i) => (
              <span key={i} style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>
          {reqs.map(r => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 2fr 1fr 28px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input style={inp} value={r.location}       onChange={e => updateReq(r.id,'location',e.target.value)}       placeholder="e.g. Summit" />
              <input style={inp} value={r.requirement}    onChange={e => updateReq(r.id,'requirement',e.target.value)}    placeholder="Requirement" />
              <input style={inp} value={r.details}        onChange={e => updateReq(r.id,'details',e.target.value)}        placeholder="Details" />
              <input style={inp} value={r.responsibility} onChange={e => updateReq(r.id,'responsibility',e.target.value)} placeholder="Client" />
              <BtnRemove onClick={() => removeReq(r.id)} />
            </div>
          ))}
          <BtnAdd onClick={addReq}>+ Add Requirement</BtnAdd>
        </Section>

        {/* ── Final Quote ── */}
        <Section title="Final Quote">
          <QsLabel>Hardware &amp; Installation</QsLabel>
          <QuoteRow label="Integration Fee"><input style={{...inp, width:140, textAlign:'right'}} value={qIntegration} onChange={e => setQIntegration(e.target.value)} placeholder="$0.00" /></QuoteRow>
          <QuoteRow label="Installation &amp; Commissioning"><input style={{...inp, width:140, textAlign:'right'}} value={qInstall} onChange={e => setQInstall(e.target.value)} placeholder="$0.00" /></QuoteRow>

          <QsLabel>Annual Bulk Subscriptions (Optional)</QsLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 28px', gap: 8, marginBottom: 4 }}>
            {['Pass Type','Qty','Unit Price','Total',''].map((h,i) => (
              <span key={i} style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>
          {bulkRows.map(r => {
            const total = (parseFloat(r.qty)||0) * parseAmt(r.unitPrice);
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 28px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <input style={inp} value={r.passType}  onChange={e => updateBulk(r.id,'passType',e.target.value)}  placeholder="Pass type" />
                <input style={inp} type="number" min="0" value={r.qty} onChange={e => updateBulk(r.id,'qty',e.target.value)} placeholder="0" />
                <input style={inp} value={r.unitPrice} onChange={e => updateBulk(r.id,'unitPrice',e.target.value)} placeholder="$0.00" />
                <input style={{...inp, background:'#f0f0f0'}} value={total > 0 ? fmtNum(total) : ''} readOnly />
                <BtnRemove onClick={() => removeBulk(r.id)} />
              </div>
            );
          })}
          <BtnAdd onClick={addBulk}>+ Add Pass Type</BtnAdd>

          <div style={{ marginTop: 14 }}>
            <QuoteRow label="Miscellaneous / Travel"><input style={{...inp, width:140, textAlign:'right'}} value={qMisc} onChange={e => setQMisc(e.target.value)} placeholder="$0.00" /></QuoteRow>
          </div>
          <Field label="Payment Terms" style={{ marginTop: 10 }}>
            <textarea style={ta} value={qPayment} onChange={e => setQPayment(e.target.value)} />
          </Field>
        </Section>

        {/* ── Extra Terms ── */}
        <Section title="Additional Terms (optional — one per line)">
          <Field label="">
            <textarea style={ta} value={termsExtra} onChange={e => setTermsExtra(e.target.value)} placeholder="e.g. All installations are covered by a 12-month workmanship warranty." />
          </Field>
        </Section>

        <button
          onClick={() => setShowPreview(true)}
          style={{ width:'100%', padding:14, background:'#FF5C39', color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer', marginTop:8 }}
        >
          Generate Proposal
        </button>
      </div>
    </div>
  );
}

// ─── Small sub-components ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e5e5e5', borderRadius:8, padding:20, marginBottom:16 }}>
      <h2 style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.7px', color:'#FF5C39', marginBottom:14 }}>{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ marginBottom:12, ...style }}>
      {label && <label style={{ display:'block', fontSize:11.5, color:'#666', marginBottom:4, fontWeight:600 }}>{label}</label>}
      {children}
    </div>
  );
}

function QsLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize:11.5, color:'#FF5C39', fontWeight:700, textTransform:'uppercase', margin:'14px 0 6px' }}>{children}</div>;
}

function QuoteRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center', marginBottom:6 }}>
      <span style={{ fontSize:12.5, color:'#444' }} dangerouslySetInnerHTML={{ __html: label }} />
      {children}
    </div>
  );
}

function BtnRemove({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background:'none', border:'none', color:'#ccc', fontSize:16, cursor:'pointer', padding:0, lineHeight:1 }}
      onMouseOver={e => (e.currentTarget.style.color='#FF5C39')}
      onMouseOut={e  => (e.currentTarget.style.color='#ccc')}
    >×</button>
  );
}

function BtnAdd({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{ background:'none', border:'1px dashed #FF5C39', color:'#FF5C39', borderRadius:5, padding:'6px 14px', fontSize:12, cursor:'pointer', marginTop:4 }}
      onMouseOver={e => (e.currentTarget.style.background='#fff3f0')}
      onMouseOut={e  => (e.currentTarget.style.background='none')}
    >{children}</button>
  );
}

const inp: React.CSSProperties = { width:'100%', padding:'7px 10px', border:'1px solid #ddd', borderRadius:5, fontSize:12.5, fontFamily:'inherit', color:'#1a1a1a', background:'#fafafa', boxSizing:'border-box' };
const ta:  React.CSSProperties = { ...inp, resize:'vertical', minHeight:60 };

// ─── ProposalPreview ──────────────────────────────────────────────────────────

interface PreviewProps {
  propNum: string; propDate: string; propValid: string;
  clientName: string; mountainName: string; clientAddr: string;
  installDays: string; installNotes: string;
  trails: TrailRow[]; reqs: ReqRow[]; bulkRows: BulkRow[];
  qIntegration: string; qInstall: string; qMisc: string;
  qPayment: string; termsExtra: string;
  trailSubtotal: number; bulkSubtotal: number; hwTotal: number;
  onBack: () => void;
}

function ProposalPreview(p: PreviewProps) {
  const {
    propNum, propDate, propValid, clientName, mountainName, clientAddr,
    installDays, installNotes, trails, reqs, bulkRows,
    qIntegration, qInstall, qMisc, qPayment, termsExtra,
    trailSubtotal, bulkSubtotal, hwTotal, onBack,
  } = p;

  useEffect(() => {
    const s = document.createElement('style');
    s.id = 'proposal-print';
    s.textContent = `@media print { .proposal-no-print { display:none!important; } body { background:#fff; } }`;
    document.head.appendChild(s);
    return () => s.remove();
  }, []);

  const installLines = installNotes.split('\n').filter(l => l.trim());
  const extraTerms   = termsExtra.split('\n').filter(l => l.trim());

  // Build hw rows
  const hwRows: { label: string; qty: string; unit: string; amt: number }[] = [];
  trails.forEach(r => {
    const q = parseFloat(r.qty)||0;
    const u = parseAmt(r.unitPrice);
    const t = q * u;
    if (t > 0) hwRows.push({ label: r.name||'-', qty: String(q), unit: fmtNum(u), amt: t });
  });
  const qi = parseAmt(qIntegration);
  const qs = parseAmt(qInstall);
  const qm = parseAmt(qMisc);
  if (qi > 0) hwRows.push({ label: 'Integration Fee',             qty:'-', unit:'-', amt: qi });
  if (qs > 0) hwRows.push({ label: 'Installation & Commissioning',qty:'-', unit:'-', amt: qs });
  if (qm > 0) hwRows.push({ label: 'Miscellaneous / Travel',      qty:'-', unit:'-', amt: qm });

  const activeBulk = bulkRows.filter(r => {
    const q = parseFloat(r.qty)||0;
    const u = parseAmt(r.unitPrice);
    return q > 0 && u > 0;
  });

  return (
    <div style={{ fontFamily:"'Segoe UI', Arial, sans-serif", fontSize:13, color:'#1a1a1a', background:'#f4f4f4', minHeight:'100vh', padding:'30px 0' }}>

      {/* Button row */}
      <div className="proposal-no-print" style={{ maxWidth:860, margin:'0 auto 20px', display:'flex', gap:8, padding:'0 0 0 0' }}>
        <button onClick={onBack}
          style={{ padding:'10px 24px', background:'#fff', border:'1px solid #FF5C39', color:'#FF5C39', borderRadius:6, fontSize:13, cursor:'pointer' }}
          onMouseOver={e => (e.currentTarget.style.background='#fff3f0')}
          onMouseOut={e  => (e.currentTarget.style.background='#fff')}
        >Edit Proposal</button>
        <button onClick={() => window.print()}
          style={{ padding:'10px 24px', background:'#FF5C39', border:'none', color:'#fff', borderRadius:6, fontSize:13, cursor:'pointer' }}
        >Print / Save as PDF</button>
      </div>

      {/* Preview document */}
      <div style={{ maxWidth:860, margin:'0 auto', background:'#fff', padding:'60px 70px', boxShadow:'0 2px 20px rgba(0,0,0,0.1)' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', borderBottom:'3px solid #FF5C39', paddingBottom:24, marginBottom:32 }}>
          <img src="https://race.yullr.com/_assets/v11/8b719608599361ca2b1d142742df531a9af04c08.png" alt="YULLR" style={{ height:48 }} />
          <div style={{ textAlign:'right', color:'#555', fontSize:12, lineHeight:'1.9' }}>
            <div><strong style={{ color:'#1a1a1a' }}>Proposal #:</strong> {propNum}</div>
            <div><strong style={{ color:'#1a1a1a' }}>Date:</strong> {fmtDate(propDate)}</div>
            <div><strong style={{ color:'#1a1a1a' }}>Valid until:</strong> {fmtDate(propValid)}</div>
          </div>
        </div>

        {/* Title block */}
        <div style={{ background:'#fff3f0', borderLeft:'4px solid #FF5C39', padding:'16px 20px', marginBottom:28, borderRadius:'0 6px 6px 0' }}>
          <h1 style={{ fontSize:19, color:'#FF5C39', marginBottom:4 }}>Project Proposal</h1>
          <h2 style={{ fontSize:15, color:'#555', fontWeight:400 }}>{clientName}</h2>
        </div>

        {/* 1. Project Summary */}
        <PH2>1. Project Summary</PH2>
        <PP>This proposal outlines the scope, hardware, subscription services, and associated costs for deploying the YULLR platform at <strong>{mountainName}</strong>, located at <strong>{clientAddr}</strong>.</PP>
        <PP>Built for demanding alpine environments, the YULLR system is designed to operate reliably in sub-zero temperatures, high winds, and heavy snowfall. Each camera is remotely managed through the YULLR cloud platform, providing real-time monitoring, firmware updates, and centralized footage management with minimal on-site maintenance.</PP>

        {/* 2. Trails */}
        <PH2>2. Trails</PH2>
        <PP>The following trails have been identified for YULLR Capture Points. Capture Point quantities and positioning are subject to adjustment based on site conditions.</PP>
        <table style={tbl}>
          <thead>
            <tr>
              <Th>Trail Name</Th><Th right>Capture Points</Th><Th>Notes</Th><Th right>Unit Price</Th><Th right>Total</Th>
            </tr>
          </thead>
          <tbody>
            {trails.map((r, i) => {
              const q = parseFloat(r.qty)||0;
              const u = parseAmt(r.unitPrice);
              const t = q * u;
              return (
                <tr key={r.id} style={i%2===1 ? {background:'#fff8f7'} : {}}>
                  <Td>{r.name||'-'}</Td>
                  <Td right>{q||'-'}</Td>
                  <Td>{r.notes||'-'}</Td>
                  <Td right>{u ? fmtNum(u) : '-'}</Td>
                  <Td right>{t ? fmtNum(t) : '-'}</Td>
                </tr>
              );
            })}
            <tr style={{ fontWeight:700, background:'#fff3f0' }}>
              <td colSpan={4} style={tdStyle}>Trail Capture Points Total</td>
              <Td right>{fmtNum(trailSubtotal)}</Td>
            </tr>
          </tbody>
        </table>

        {/* 3. Installation Notes */}
        <PH2>3. Installation Notes</PH2>
        <PP>Installation will be carried out by a YULLR technician or approved installation partner. The following conditions apply:</PP>
        <ul style={{ marginLeft:18, lineHeight:'2.2', color:'#444', fontSize:12.5 }}>
          <li>Installation is estimated to take <strong>{installDays||'[X]'}</strong> to complete.</li>
          <li>All installations will be scheduled and coordinated with designated on mountain contact.</li>
          <li>Each Capture Point will be mounted, aligned, and tested on-site before sign-off.</li>
          <li>YULLR will provide full system commissioning and staff orientation prior to the start of the season.</li>
          {installLines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>

        {/* 4. Site Requirements */}
        <PH2>4. Site Requirements</PH2>
        <PP>The following requirements must be in place at each designated location prior to the installation date. Unless otherwise agreed in writing.</PP>
        <table style={tbl}>
          <thead>
            <tr><Th>Location</Th><Th>Requirement</Th><Th>Details</Th><Th>Responsibility</Th></tr>
          </thead>
          <tbody>
            {reqs.map((r, i) => (
              <tr key={r.id} style={i%2===1 ? {background:'#fff8f7'} : {}}>
                <Td>{r.location}</Td><Td>{r.requirement}</Td><Td>{r.details}</Td><Td>{r.responsibility}</Td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 5. Subscriptions */}
        <PH2>5. YULLR Subscriptions</PH2>
        <PP>Skiers and riders at {mountainName} can purchase YULLR subscriptions to receive their footage. The following subscription types are available at published rates:</PP>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginTop:10 }}>
          <SubCard title="Day Pass" price="$20" scope="1 Mountain · 1 Day">Access to all YULLR footage captured at {mountainName} for a single visit day.</SubCard>
          <SubCard title="Mountain Pass" price="$150" scope="1 Mountain · Full Season">Unlimited footage access at {mountainName} for the entire ski season.</SubCard>
          <SubCard title="Season Pass" price="$200" scope="All YULLR Mountains · Full Season">Unlimited footage access across all YULLR-enabled mountains for the full season.</SubCard>
        </div>
        <div style={{ background:'#fff3f0', border:'2px solid #FF5C39', borderRadius:8, padding:'14px 18px', marginTop:14 }}>
          <h3 style={{ color:'#FF5C39', fontSize:12.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>Bulk Purchase Program</h3>
          <ul style={{ listStyle:'none', fontSize:12.5, color:'#333', lineHeight:2 }}>
            {[
              <>A <strong>50% discount</strong> applies to all bulk purchases of <strong>25 or more passes</strong> of any type.</>,
              <>Bulk passes may be resold up to the published retail rate.</>,
              <>Bulk passes are non-refundable and valid for the current season only.</>,
              <>Additional bulk pass purchases after the initial order must be made in increments of 25.</>,
            ].map((item, i) => (
              <li key={i} style={{ paddingLeft:16, position:'relative' }}>
                <span style={{ position:'absolute', left:0, color:'#FF5C39', fontWeight:700 }}>-</span>{item}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ background:'#f0fdf4', border:'2px solid #22c55e', borderRadius:8, padding:'14px 18px', marginTop:12 }}>
          <h3 style={{ color:'#15803d', fontSize:12.5, fontWeight:700, textTransform:'uppercase', marginBottom:8 }}>Revenue Share - YULLR.COM Sales</h3>
          <p style={{ color:'#166534', fontSize:12.5, lineHeight:1.8, margin:0 }}>
            {mountainName} will receive a <strong>15% profit share</strong> on all pass purchases completed through YULLR.COM that are attributable to {mountainName}. This includes all sales tracked through referral links, promo codes, QR codes, on-mountain signage, and any other trackable attribution method. Revenue share payments will be calculated per season and remitted within <strong>30 days</strong> of the end of the season, accompanied by a detailed sales report.
          </p>
        </div>

        {/* 6. Final Quote */}
        <PH2>6. Final Quote</PH2>
        <table style={tbl}>
          <thead>
            <tr><Th>Item</Th><Th right>Qty</Th><Th right>Unit Price</Th><Th right>Amount</Th></tr>
          </thead>
          <tbody>
            <tr style={{ background:'#fff3f0' }}>
              <td colSpan={4} style={{ ...tdStyle, fontWeight:600, color:'#FF5C39', fontSize:11.5, textTransform:'uppercase', letterSpacing:'0.5px', padding:'6px 12px' }}>Hardware &amp; Installation</td>
            </tr>
            {hwRows.map((r, i) => (
              <tr key={i} style={i%2===1 ? {background:'#fff8f7'} : {}}>
                <td style={{ ...tdStyle, paddingLeft:24 }}>{r.label}</td>
                <Td right>{r.qty}</Td>
                <Td right>{r.unit}</Td>
                <Td right>{fmtNum(r.amt)}</Td>
              </tr>
            ))}
            <tr style={{ fontWeight:600, background:'#fef6f4', borderTop:'1px solid #ffd5cc' }}>
              <td colSpan={3} style={{ ...tdStyle, paddingLeft:12, fontSize:12 }}>Hardware &amp; Installation Total</td>
              <Td right>{fmtNum(hwTotal)}</Td>
            </tr>
            {activeBulk.length > 0 && (
              <>
                <tr><td colSpan={4} style={{ padding:6, border:'none' }}>&nbsp;</td></tr>
                <tr style={{ background:'#fff3f0' }}>
                  <td colSpan={4} style={{ ...tdStyle, fontWeight:600, color:'#FF5C39', fontSize:11.5, textTransform:'uppercase', letterSpacing:'0.5px', padding:'6px 12px' }}>Annual Bulk Subscriptions (Optional)</td>
                </tr>
                {activeBulk.map((r, i) => {
                  const q = parseFloat(r.qty)||0;
                  const u = parseAmt(r.unitPrice);
                  return (
                    <tr key={r.id} style={i%2===1 ? {background:'#fff8f7'} : {}}>
                      <td style={{ ...tdStyle, paddingLeft:24 }}>{r.passType||'-'}</td>
                      <Td right>{r.qty}</Td>
                      <Td right>{fmtNum(u)}</Td>
                      <Td right>{fmtNum(q*u)}</Td>
                    </tr>
                  );
                })}
                <tr style={{ fontWeight:600, background:'#fef6f4', borderTop:'1px solid #ffd5cc' }}>
                  <td colSpan={3} style={{ ...tdStyle, paddingLeft:12, fontSize:12 }}>Annual Bulk Subscriptions Total</td>
                  <Td right>{fmtNum(bulkSubtotal)}</Td>
                </tr>
              </>
            )}
          </tbody>
        </table>
        <div style={{ background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:6, padding:'10px 14px', marginTop:10, fontSize:12, color:'#78350f' }}>
          <strong style={{ display:'block', marginBottom:3 }}>Payment Terms</strong>
          {qPayment}
        </div>

        {/* 7. Terms */}
        <PH2>7. Terms</PH2>
        <ol style={{ listStyle:'none' }}>
          {[
            'This proposal is valid for 30 days from the date of issue. After this period, pricing may be subject to change.',
            'Acceptance of this proposal constitutes agreement to execute the Customer Agreement and Order Form within 30 days.',
            'All hardware remains the property of YULLR.',
            'Installation dates are subject to availability and will be confirmed upon receipt of deposit.',
            'YULLR is not responsible for delays caused by site conditions that do not meet the requirements outlined in Section 4.',
            'Subscription and pass pricing is subject to change at the start of each new ski season.',
            'An annual maintenance fee of $250.00 will apply to each Capture Point starting in year 2.',
            'The YULLR Customer Agreement is for a five (5) year Initial Term.',
            ...extraTerms,
          ].map((t, i) => (
            <li key={i} style={{ padding:'7px 0 7px 26px', position:'relative', borderBottom:'1px solid #f0f0f0', fontSize:12.5, lineHeight:1.6, color:'#444' }}>
              <span style={{ position:'absolute', left:0, fontWeight:700, color:'#FF5C39' }}>{i+1}.</span>
              {t}
            </li>
          ))}
        </ol>

        {/* Footer / Signatures */}
        <div style={{ marginTop:40, paddingTop:20, borderTop:'2px solid #FF5C39', display:'flex', justifyContent:'space-between' }}>
          <SigBlock label={`Accepted by (${clientName})`} />
          <SigBlock label="Authorized by (YULLR)" right />
        </div>
        <div style={{ fontSize:11, color:'#aaa', textAlign:'center', marginTop:16 }}>
          YULLR, Inc. &nbsp;|&nbsp; Confidential Proposal &nbsp;|&nbsp; Proposal # {propNum}
        </div>
      </div>
    </div>
  );
}

// ─── Preview sub-components ───────────────────────────────────────────────────

function PH2({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize:12.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.8px', color:'#FF5C39', borderBottom:'1px solid #ffd5cc', paddingBottom:6, margin:'28px 0 12px' }}>{children}</div>;
}
function PP({ children }: { children: React.ReactNode }) {
  return <p style={{ lineHeight:1.75, color:'#333', marginBottom:10, fontSize:13 }}>{children}</p>;
}
function SubCard({ title, price, scope, children }: { title: string; price: string; scope: string; children: React.ReactNode }) {
  return (
    <div style={{ border:'1px solid #ffd5cc', borderRadius:8, padding:16, textAlign:'center' }}>
      <h3 style={{ fontSize:13, color:'#FF5C39', marginBottom:4 }}>{title}</h3>
      <div style={{ fontSize:22, fontWeight:800, color:'#1a1a1a' }}>{price}</div>
      <div style={{ fontSize:11, color:'#777', marginBottom:6 }}>{scope}</div>
      <p style={{ fontSize:11.5, color:'#555', textAlign:'left' }}>{children}</p>
    </div>
  );
}
function SigBlock({ label, right }: { label: string; right?: boolean }) {
  return (
    <div style={{ fontSize:12, color:'#555', width:340, textAlign: right ? 'right' : 'left' }}>
      <div style={{ fontWeight:600, marginBottom:4 }}>{label}</div>
      <div style={{ display:'flex', justifyContent:'space-between', borderTop:'1px solid #999', width:340, marginTop:36, paddingTop:5 }}>
        <span style={{ fontSize:11, color:'#888' }}>Signature</span>
        <span style={{ fontSize:11, color:'#888' }}>Date</span>
      </div>
    </div>
  );
}

const tbl: React.CSSProperties = { width:'100%', borderCollapse:'collapse', marginTop:8, fontSize:12.5 };
const tdStyle: React.CSSProperties = { padding:'8px 12px', borderBottom:'1px solid #fde8e3' };

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th style={{ background:'#FF5C39', color:'#fff', textAlign: right ? 'right' : 'left', padding:'9px 12px', fontWeight:600, fontSize:12 }}>{children}</th>;
}
function Td({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <td style={{ ...tdStyle, textAlign: right ? 'right' : 'left' }}>{children}</td>;
}
