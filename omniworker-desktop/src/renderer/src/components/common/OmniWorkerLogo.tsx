function OmniWorkerLogo({ size = 32 }: { size?: number }): React.JSX.Element {
  return (
    <div style={{
      width: size,
      height: size,
      backgroundColor: 'var(--text-primary)',
      color: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'bold',
      fontSize: Math.max(10, size * 0.4) + 'px',
      borderRadius: Math.max(4, size * 0.15) + 'px',
      fontFamily: 'monospace'
    }}>
      OW
    </div>
  );
}

export default OmniWorkerLogo;
