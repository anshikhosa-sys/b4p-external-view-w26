import Icon from './Icons';

export default function SearchBar({ value, onChange, total }) {
  const count = total ? `${total.toLocaleString('en-US')} ` : '';
  return (
    <div className="search" role="search">
      <label htmlFor="supply-search" className="visually-hidden">Search supplies</label>
      <Icon name="search" size={18} className="search__icon" />
      <input
        id="supply-search"
        className="search__input"
        type="search"
        autoComplete="off"
        spellCheck="false"
        enterKeyHint="search"
        placeholder={`Search ${count}supplies`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
      />
      {value && (
        <button type="button" className="search__clear icon-btn" onClick={() => onChange('')} aria-label="Clear search">
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
