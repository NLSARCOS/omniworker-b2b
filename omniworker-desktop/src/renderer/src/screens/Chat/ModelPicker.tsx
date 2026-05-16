import { memo, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "../../components/useI18n";

interface OmniWorkerModel {
  id: string;
  label: string;
  provider: string;
  model: string;
}

const OMNIWORKER_MODELS: OmniWorkerModel[] = [
  {
    id: "normal",
    label: "OmniWorker Normal",
    provider: "omniworker",
    model: "omniworker",
  },
  {
    id: "code",
    label: "OmniWorker Code",
    provider: "omniworker",
    model: "omniworker-code",
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
  const found = OMNIWORKER_MODELS.find((m) => m.model === model);
  if (found) return found.label;
  if (model === "omniworker-code") return "OmniWorker Code";
  return "OmniWorker Normal";
}

export const ModelPicker = memo(function ModelPicker({
  currentModel,
  currentProvider,
  currentBaseUrl,
  displayModel,
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

  function select(m: OmniWorkerModel): void {
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
            <div className="chat-model-group-label">OmniWorker</div>
            {OMNIWORKER_MODELS.map((m) => {
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
