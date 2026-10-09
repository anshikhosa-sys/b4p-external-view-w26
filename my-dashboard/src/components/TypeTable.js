import { Fragment, useState } from 'react';
import { ProductIcon } from '../catalogIcons';
import { badgesFor, formatExpiry, formatMonth, stockLabel } from '../inventory';
import Badges from './Badges';
import RequestControl from './RequestControl';

// The sheet's generic name, unless it just repeats the row or group name.
function showGeneral(item, group) {
  const bare = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '').replace(/e$/, '');
  const g = bare(item.general || '');
  return !!g && g !== bare(item.name) && g !== bare(group.label);
}

const qty = (n) => (n == null ? '–' : n.toLocaleString('en-US'));

// One product type: drawing once in the header, then a dense spec table with
// one row per product; products held in several lots expand to show them.
export default function TypeTable({ group, quantityOf, onQuantity, onOpenItem, limit, headingLevel = 2 }) {
  const [open, setOpen] = useState({});
  const Heading = `h${headingLevel}`;
  const rows = limit ? group.items.slice(0, limit) : group.items;
  const headingId = `type-${group.slug}${group.category ? `-${group.category.slug}` : ''}`;
  return (
    <section className="type" id={headingId} aria-labelledby={`${headingId}-h`} tabIndex={-1}>
      <div className="type__head">
        <span className="type__art"><ProductIcon type={group.icon} size={32} /></span>
        <Heading className="type__title" id={`${headingId}-h`}>
          {group.label} <span className="type__count num">{group.items.length.toLocaleString('en-US')}</span>
        </Heading>
        {group.category && <span className="type__cat">in {group.category.name}</span>}
      </div>
      <table className="spec">
        <thead>
          <tr>
            <th scope="col" className="spec__supply">Supply</th>
            <th scope="col" className="spec__maker">Maker</th>
            <th scope="col" className="spec__lot">Lot</th>
            <th scope="col" className="spec__exp">Expires</th>
            <th scope="col" className="spec__stock">In stock</th>
            <th scope="col" className="spec__qty"><span className="visually-hidden">Quantity to request</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const many = p.lots.length > 1;
            const expanded = !!open[p.id];
            const lotsId = `lots-${p.row}`;
            return (
              <Fragment key={p.id}>
                <tr className="item-row" data-row={p.row}>
                  <td className="spec__supply">
                    <button type="button" className="linklike item-row__name" onClick={() => onOpenItem(p.row)}>
                      {p.name}
                    </button>
                    {showGeneral(p, group) && <span className="item-row__general">{p.general}</span>}
                    <Badges badges={badgesFor(p, p.onHold)} />
                  </td>
                  <td className="spec__maker" data-label="Maker">{p.manufacturer || '–'}</td>
                  <td className="spec__lot num" data-label="Lot">
                    {many ? (
                      <button
                        type="button"
                        className="linklike lots-toggle"
                        aria-expanded={expanded}
                        aria-controls={lotsId}
                        onClick={() => setOpen((o) => ({ ...o, [p.id]: !expanded }))}
                      >
                        {p.lots.length} lots
                      </button>
                    ) : (p.lot || '–')}
                  </td>
                  <td className="spec__exp num" data-label="Expires">
                    {!p.expiry ? '–' : many ? `from ${formatMonth(p.expiry)}` : formatExpiry(p.expiry)}
                  </td>
                  <td className="spec__stock num" data-label="In stock">
                    <span className="visually-hidden">{stockLabel(p.quantity)}</span>
                    <span aria-hidden="true">{qty(p.quantity)}</span>
                  </td>
                  <td className="spec__qty">
                    <RequestControl item={p} quantity={quantityOf(p.id)} onChange={(n) => onQuantity(p, n)} compact />
                  </td>
                </tr>
                {many && expanded && (
                  <tr className="lots-row" id={lotsId}>
                    <td colSpan={6}>
                      <table className="lots">
                        <caption className="visually-hidden">Lots of {p.name}, earliest expiry first</caption>
                        <thead>
                          <tr>
                            <th scope="col">Lot</th>
                            <th scope="col">Box</th>
                            <th scope="col">Expires</th>
                            <th scope="col" className="lots__qty">In stock</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.lots.map((l) => (
                            <tr key={l.id} className={l.expiryState === 'expired' ? 'lots__expired' : undefined}>
                              <td>{l.lot || '–'}</td>
                              <td>{[l.box && `Box ${l.box}`, l.pallet && `pallet ${l.pallet}`].filter(Boolean).join(', ') || '–'}</td>
                              <td>
                                {l.expiry ? formatExpiry(l.expiry) : '–'}
                                {l.expiryState === 'expired' && ' (expired)'}
                              </td>
                              <td className="lots__qty">{qty(l.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
