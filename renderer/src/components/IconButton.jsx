export default function IconButton({
  icon,
  label,
  onClick,
  disabled,
  variant = "secondary",
  type = "button",
  className = ""
}) {
  return (
    <button
      type={type}
      className={`icon-button icon-button-${variant} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
