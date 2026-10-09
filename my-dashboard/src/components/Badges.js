export default function Badges({ badges }) {
  if (!badges.length) return null;
  return (
    <ul className="badges">
      {badges.map((b) => (
        <li key={b.label} className={`badge badge--${b.kind}`}>{b.label}</li>
      ))}
    </ul>
  );
}
