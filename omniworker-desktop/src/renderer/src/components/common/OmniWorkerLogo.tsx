import icon from "../../assets/icon.png";

function OmniWorkerLogo({ size = 32 }: { size?: number }): React.JSX.Element {
  return (
    <img
      src={icon}
      width={size}
      height={size}
      className="rounded-xl"
      alt="OmniWorker"
    />
  );
}

export default OmniWorkerLogo;
