import { memo, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

interface Flux AgentModel {
  id: string;
  label: string;
  provider: string;
  model: string;
}

const FLUX AGENT_MODELS: Flux AgentModel[] = [
  {
    id: "normal",
    label: "Flux Agent Normal",
    provider: "flux-agent",
    model: "flux-agent",
  },
  {
    id: "code",
    label: "Flux Agent Code",
    provider: "flux-agent",
    model: "flux-agent-code",
  },
];

interface ModelPickerProps {
  currentModel: string;
  currentProvider: string;
  currentBaseUrl: string;
  displayModel: string;
  onOpen: () => void;
  onSelectModel: (provider: string, model: string, baseUrl: string) => void;
}

function getDisplayLabel(model: string): string {
  const found = FLUX AGENT_MODELS.find((m) => m.model === model);
  if (found) return found.label;
  if (model === "flux-agent-code") return "Flux Agent Code";
  return "Flux Agent Normal";
}

export const ModelPicker = memo(function ModelPicker({
  currentModel,
  currentBaseUrl,
  onOpen,
  onSelectModel,
}: ModelPickerProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent): void {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  function toggle(): void {
    if (!isOpen) onOpen();
    setIsOpen((v) => !v);
  }

  function select(m: Flux AgentModel): void {
    onSelectModel(m.provider, m.model, currentBaseUrl);
    setIsOpen(false);
  }

  const label = getDisplayLabel(currentModel);

  return (
    <div className="chat-model-bar" ref={pickerRef}>
      <button className="chat-model-trigger" onClick={toggle}>
        <span className="chat-model-name">{label}</span>
        <ChevronDown size={12} />
      </button>

      {isOpen && (
        <div className="chat-model-dropdown">
          <div className="chat-model-group">
            <div className="chat-model-group-label">Flux Agent</div>
            {FLUX AGENT_MODELS.map((m) => {
              const active = currentModel === m.model;
              return (
                <button
                  key={m.id}
                  className={`chat-model-option ${active ? "active" : ""}`}
                  onClick={() => select(m)}
                >
                  <span className="chat-model-option-label">{m.label}</span>
                  <span className="chat-model-option-id">
                    {m.id === "code" ? "Code" : "General"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
