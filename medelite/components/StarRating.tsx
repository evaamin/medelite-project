export function StarRating({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="star-empty">Not rated</span>;
  }
  return (
    <span className="stars" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= value ? "star on" : "star off"}>
          ★
        </span>
      ))}
      <span className="star-num">{value}/5</span>
    </span>
  );
}
