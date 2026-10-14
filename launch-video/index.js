import { registerRoot, Composition } from 'remotion';
import { LaunchVideo, durationInFrames } from './launch.js';

function Root() {
  return (
    <Composition
      id="MyselfLaunch"
      component={LaunchVideo}
      durationInFrames={durationInFrames}
      fps={30}
      width={1280}
      height={720}
    />
  );
}
registerRoot(Root);
