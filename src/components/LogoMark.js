import React from 'react';

const LogoMark = ({ size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    role="img"
    aria-label="ExpenseTracker logo"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="7" y="5" width="30" height="38" rx="7" fill="white" fillOpacity="0.2" />
    <path
      d="M16 15h14M16 23h10M16 31h8"
      stroke="white"
      strokeWidth="3.2"
      strokeLinecap="round"
    />
    <circle cx="34" cy="33" r="9" fill="white" />
    <path
      d="M31 29h6M31 33h6M34.5 29c2 0 3.5 1.1 3.5 2.8 0 1.8-1.5 2.9-3.5 2.9H31L37 39"
      stroke="url(#expenseTrackerAccent)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <defs>
      <linearGradient id="expenseTrackerAccent" x1="30" y1="28" x2="39" y2="39" gradientUnits="userSpaceOnUse">
        <stop stopColor="#6366f1" />
        <stop offset="1" stopColor="#8b5cf6" />
      </linearGradient>
    </defs>
  </svg>
);

export default LogoMark;
