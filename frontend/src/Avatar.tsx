type AvatarProps = {
  name: string;
  mine?: boolean;
};

export function Avatar({ name, mine = false }: AvatarProps) {
  const label = mine ? "你" : name.trim() || "…";
  const shown = label.length > 4 ? label.slice(0, 2) : label;
  return (
    <span className={`avatar${mine ? " mine" : ""}`}>
      {shown}
    </span>
  );
}
