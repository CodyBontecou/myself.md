import { registerRoot, Composition } from 'remotion';
import { LaunchVideo, durationInFrames } from './launch.js';
import { ProductHuntGallery, ProductHuntThumbnail, ProductHuntOverview } from './product-hunt.js';

function Root() {
  return (
    <>
      <Composition
        id="MyselfLaunch"
        component={LaunchVideo}
        durationInFrames={durationInFrames}
        fps={30}
        width={1280}
        height={720}
      />
      {[1, 2, 3, 4, 5].map((slide) => (
        <Composition
          key={slide}
          id={`ProductHunt${slide}`}
          component={ProductHuntGallery}
          defaultProps={{ slide }}
          durationInFrames={1}
          fps={30}
          width={1270}
          height={760}
        />
      ))}
      <Composition
        id="ProductHuntThumbnail"
        component={ProductHuntThumbnail}
        durationInFrames={1}
        fps={30}
        width={240}
        height={240}
      />
      <Composition
        id="ProductHuntOverview"
        component={ProductHuntOverview}
        durationInFrames={1}
        fps={30}
        width={1270}
        height={1187}
      />
    </>
  );
}
registerRoot(Root);
