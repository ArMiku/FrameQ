import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { tokens } from "../styles";

export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
};

export type CaptionGroup = {
  startFrame: number;
  endFrame: number;
  text: string;
  highlight: string;
};

type CaptionTrackProps = {
  captionWords: Caption[];
  groups: CaptionGroup[];
  keywords: string[];
};

const findMatchingTerm = (
  text: string,
  group: CaptionGroup | undefined,
  keywords: string[],
) => {
  const terms = [group?.highlight, ...keywords]
    .filter(
      (term): term is string =>
        typeof term === "string" && term.length > 0 && text.includes(term),
    )
    .sort((left, right) => right.length - left.length);

  return terms[0] ?? null;
};

const getCurrentCaption = (captions: Caption[], currentMs: number) => {
  const activeCaption = captions.find(
    (caption) => caption.startMs <= currentMs && caption.endMs > currentMs,
  );

  if (activeCaption) {
    return activeCaption;
  }

  return captions
    .filter((caption) => caption.endMs <= currentMs && currentMs - caption.endMs <= 250)
    .sort((left, right) => right.endMs - left.endMs)[0] ?? null;
};

export const CaptionTrack: React.FC<CaptionTrackProps> = ({ captionWords, groups, keywords }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  const activeGroup = groups.find(
    (group) => frame >= group.startFrame && frame < group.endFrame,
  );

  const currentCaption = getCurrentCaption(captionWords, currentMs);

  if (!activeGroup || !currentCaption) {
    return null;
  }

  const matchingTerm = findMatchingTerm(currentCaption.text, activeGroup, keywords);
  const groupLocalFrame = frame - activeGroup.startFrame;
  const entrance = interpolate(groupLocalFrame, [0, 12], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...tokens.motion.easeOut),
  });
  const opacity = interpolate(groupLocalFrame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...tokens.motion.easeOut),
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingLeft: tokens.layout.safeX,
        paddingRight: tokens.layout.safeX,
        paddingBottom: tokens.layout.captionBottom,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: tokens.layout.captionMaxWidth,
          transform: `translateY(${entrance}px)`,
          opacity,
          textAlign: "center",
          fontFamily: tokens.font.family,
          fontSize: tokens.font.captionSize,
          lineHeight: tokens.font.captionLineHeight,
          fontWeight: 800,
          letterSpacing: 0,
          color: tokens.colors.ink,
          textShadow: "0 4px 22px rgba(0, 0, 0, 0.62)",
          whiteSpace: "pre-wrap",
        }}
      >
        {matchingTerm
          ? currentCaption.text.split(matchingTerm).map((textPart, index, parts) => (
              <span key={`${currentCaption.startMs}-${index}`}>
                {textPart}
                {index < parts.length - 1 ? (
                  <span
                    style={{
                      color: tokens.colors.accentWarm,
                      backgroundColor: "rgba(250, 204, 21, 0.16)",
                      borderRadius: tokens.layout.radius,
                      padding: "0 8px 3px",
                    }}
                  >
                    {matchingTerm}
                  </span>
                ) : null}
              </span>
            ))
          : (
            <span
              style={{
                color: tokens.colors.ink,
              }}
            >
              {currentCaption.text}
            </span>
          )}
      </div>
    </AbsoluteFill>
  );
};
