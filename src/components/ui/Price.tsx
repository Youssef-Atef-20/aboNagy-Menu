interface PriceProps {
  amount: number;
}

export function Price({ amount }: PriceProps) {
  return (
    <span className="price-tag">
      {amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}
      <span className="price-unit"> ج.م</span>
    </span>
  );
}
