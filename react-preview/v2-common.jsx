(function () {
  const H = window.HuddleV2;
  const { num, txt, rowName, recordUrl, toneForRate } = H.helpers;
  H.Badge = ({ tone, children }) => <span className={`badge ${tone}`}>{children}</span>;
  H.Avatar = ({ rep, small }) => <b className={`avatar ${small ? 'small' : ''}`} style={{ '--rep': rep.color || '#13a466' }}>{txt(rep.name, '?')[0]}</b>;
  H.Card = ({ title, icon, action, children, className = '' }) => <section className={`card ${className}`}><div className="card-head"><div><i>{icon}</i><h3>{title}</h3></div>{action}</div>{children}</section>;
  H.Empty = ({ text }) => <div className="empty">✓ {text}</div>;
  H.Tile = ({ value, label, tone }) => <div className="tile"><strong className={tone}>{typeof value === 'number' ? value.toLocaleString() : value}</strong><span>{label}</span></div>;
  H.Metric = ({ tone, value, label, note, click }) => <button className={`metric ${tone}`} onClick={click}><strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong><b>{label}</b><small>{note}</small></button>;
  H.PMetric = ({ tone, value, label, click }) => <button className={`pmetric ${tone}`} onClick={click}><strong>{num(value).toLocaleString()}</strong><span>{label}</span></button>;
  H.Segment = ({ value, options, labels = {}, onChange }) => <div className="segments">{options.map(option => <button key={option} className={value === option ? 'active' : ''} onClick={() => onChange(option)}>{labels[option] || option}</button>)}</div>;
  H.RecordLink = ({ row }) => <a className="record-link" href={recordUrl(row)} target="_blank" title={rowName(row)}>{rowName(row)} ↗</a>;
  H.Rate = ({ value }) => { const tone = toneForRate(value); const color = tone === 'green' ? '#13a466' : tone === 'amber' ? '#db8a12' : '#df4037'; return <span className="rate"><b style={{ color }}>{value}%</b><i><em style={{ width: `${Math.min(value, 100)}%`, background: color }}/></i></span>; };
  H.Table = ({ heads, rows, firstSticky = false }) => <div className={`table ${firstSticky ? 'table-sticky-first' : ''}`}><table><thead><tr>{heads.map(head => <th key={head}>{head}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
})();
