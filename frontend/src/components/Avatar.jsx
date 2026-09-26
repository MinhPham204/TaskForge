import { useState } from 'react';

const initialsFor = (name) => {
  const initials = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
  return initials.toUpperCase() || '?';
};

const Avatar = ({ src, name, alt, className = 'h-10 w-10' }) => {
  const [failed, setFailed] = useState(false);
  const label = alt || `${name || 'User'} avatar`;

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={label}
        className={`${className} rounded-full object-cover`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={label}
      className={`${className} inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary`}
    >
      {initialsFor(name)}
    </span>
  );
};

export default Avatar;
