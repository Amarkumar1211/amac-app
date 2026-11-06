import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = '20px', borderRadius = '4px', style }: SkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: '#e0e0e0',
        animation: 'pulse 1.5s infinite ease-in-out',
        ...style
      }}
    >
      <style>
        {`
          @keyframes pulse {
            0% { background-color: #e0e0e0; }
            50% { background-color: #f5f5f5; }
            100% { background-color: #e0e0e0; }
          }
        `}
      </style>
    </div>
  );
}
