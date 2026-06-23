(function () {
  const { useEffect } = React;
  const H = window.HuddleV2;
  const { txt, money, first, rowOwner, rowCountry, rowAge, rowDate } = H.helpers;
  H.Modal = function Dialog({ title, description, rows, empty, close }) {
    useEffect(() => {
      const handler = event => event.key === 'Escape' && close();
      addEventListener('keydown', handler);
      return () => removeEventListener('keydown', handler);
    }, []);
    return <div className="modal-bg"><div className="modal"><div className="modal-head"><span><h2>{title}</h2><p>{description}</p></span><button onClick={close}>×</button></div><div className="modal-body">{rows.length ? rows.map((row, index) => <div className="modal-row" key={index}><b>{index + 1}</b><span><H.RecordLink row={row}/><small>{[txt(row._type, ''), rowOwner(row), rowCountry(row), rowDate(row)].filter(value => value && value !== '—').join(' · ')}</small></span><strong>{first(row, ['amount']) !== undefined ? money(first(row, ['amount'])) : rowAge(row)}</strong></div>) : <H.Empty text={empty || 'No rows found.'}/>}</div></div></div>;
  };
})();
