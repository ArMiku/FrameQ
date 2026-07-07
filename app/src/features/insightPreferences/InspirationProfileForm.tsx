import { CheckCircle2, X } from "lucide-react";
import { useState } from "react";
import {
  INSIGHT_PREFERENCE_FIELDS,
  PROFILE_FIELD_ORDER,
  validateInspirationProfile,
  type InspirationProfile,
  type ProfileField,
} from "../../insightPreferences";

type InspirationProfileFormProps = {
  initialProfile: InspirationProfile | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (profile: InspirationProfile) => void;
};

const EMPTY_PROFILE: InspirationProfile = {
  role: "unspecified",
  domain: "unspecified",
  stage: "unspecified",
  cityContext: "unspecified",
  genderPerspective: "unspecified",
  platforms: [],
  defaultStyles: [],
  defaultAvoid: [],
};

export function InspirationProfileForm({
  initialProfile,
  busy,
  onCancel,
  onSave,
}: InspirationProfileFormProps) {
  const [draft, setDraft] = useState<InspirationProfile>(initialProfile ?? EMPTY_PROFILE);
  const validProfile = validateInspirationProfile(draft);

  function selectSingle(field: ProfileField, id: string) {
    setDraft((current) => ({
      ...current,
      [field]: id,
    }));
  }

  function toggleMulti(field: ProfileField, id: string, max: number) {
    setDraft((current) => {
      const values = current[field];
      if (!Array.isArray(values)) {
        return current;
      }
      if (values.includes(id)) {
        return {
          ...current,
          [field]: values.filter((value) => value !== id),
        };
      }
      if (values.length >= max) {
        return current;
      }
      return {
        ...current,
        [field]: [...values, id],
      };
    });
  }

  return (
    <div className="preference-form">
      <div className="preference-form-grid">
        {PROFILE_FIELD_ORDER.map((field) => {
          const config = INSIGHT_PREFERENCE_FIELDS[field];
          const rawValue = draft[field];
          const selectedValues = Array.isArray(rawValue) ? rawValue : [rawValue];
          const maxReached = Array.isArray(rawValue) && rawValue.length >= config.max;

          return (
            <section className="preference-field" key={field}>
              <div className="preference-field-header">
                <span>{config.label}</span>
                {config.mode === "multi" ? <small>最多 {config.max} 个</small> : null}
              </div>
              <div className="preference-options">
                {config.options.map((option) => {
                  const selected = selectedValues.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`preference-option ${selected ? "selected" : ""}`}
                      disabled={busy || (!selected && maxReached)}
                      onClick={() => {
                        if (config.mode === "single") {
                          selectSingle(field, option.id);
                        } else {
                          toggleMulti(field, option.id, config.max);
                        }
                      }}
                    >
                      {selected ? <CheckCircle2 size={14} /> : null}
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="settings-actions sheet-footer">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
          <X size={16} />
          <span>取消</span>
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={busy || !validProfile}
          onClick={() => {
            if (validProfile) {
              onSave(validProfile);
            }
          }}
        >
          <CheckCircle2 size={16} />
          <span>{busy ? "保存中" : "保存档案"}</span>
        </button>
      </div>
    </div>
  );
}
