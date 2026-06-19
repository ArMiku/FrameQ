import "./index.css";
import { Composition } from "remotion";
import { FrameQPromo } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FrameQPromo"
        component={FrameQPromo}
        durationInFrames={1350}
        fps={30}
        width={1080}
        height={1350}
      />
    </>
  );
};
