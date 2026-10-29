import { registerRoot, Composition } from 'remotion';
import { LaunchVideo, durationInFrames } from './launch.js';
import { ProductHuntGallery, ProductHuntThumbnail, ProductHuntOverview } from './product-hunt.js';
import { StoreArtwork, StoreIcon } from './app-stores.js';
import {
  StoreCreative,
  StoreProduct,
  StoreShowcase,
  StoreSourcePortrait,
  StoreTrailer,
} from './store-package.js';
import { storeAssets, storeVideos } from './store-assets.js';

function Root() {
  return (
    <>
      {storeAssets.map((asset) => {
        const common = {
          id: asset.id,
          durationInFrames: 1,
          fps: 30,
          width: asset.width,
          height: asset.height,
        };
        if (asset.kind === 'editorial' && (asset.slide ?? 1) >= 3)
          return (
            <Composition
              key={asset.id}
              {...common}
              component={StoreSourcePortrait}
              defaultProps={{
                platform: asset.platform ?? 'iphone',
                slide: asset.slide ?? 3,
                editorial: true,
              }}
            />
          );
        if (asset.kind === 'editorial')
          return (
            <Composition
              key={asset.id}
              {...common}
              component={StoreArtwork}
              defaultProps={{
                platform: asset.platform ?? 'iphone',
                slide: asset.slide ?? 1,
                tablet: asset.platform === 'ipad',
              }}
            />
          );
        if (asset.kind === 'showcase')
          return (
            <Composition
              key={asset.id}
              {...common}
              component={StoreShowcase}
              defaultProps={{ platform: asset.platform ?? 'iphone', slide: asset.slide ?? 1 }}
            />
          );
        if (asset.kind === 'product')
          return (
            <Composition
              key={asset.id}
              {...common}
              component={StoreProduct}
              defaultProps={{ product: asset.product ?? 'lifetime' }}
            />
          );
        return (
          <Composition
            key={asset.id}
            {...common}
            component={StoreCreative}
            defaultProps={{ format: asset.format ?? 'header' }}
          />
        );
      })}
      {storeVideos.map((asset) =>
        asset.kind === 'trailer' ? (
          <Composition
            key={asset.id}
            id={asset.id}
            component={StoreTrailer}
            defaultProps={{ platform: asset.platform ?? 'android' }}
            durationInFrames={asset.frames}
            fps={30}
            width={asset.width}
            height={asset.height}
          />
        ) : (
          <Composition
            key={asset.id}
            id={asset.id}
            component={StoreCreative}
            defaultProps={{ format: asset.format ?? 'header', motion: true }}
            durationInFrames={asset.frames}
            fps={30}
            width={asset.width}
            height={asset.height}
          />
        ),
      )}
      {['iphone', 'android'].flatMap((platform) =>
        [1, 2, 3, 4].map((slide) => (
          <Composition
            key={`${platform}${slide}`}
            id={`Store-${platform}-${slide}`}
            component={slide >= 3 ? StoreSourcePortrait : StoreArtwork}
            defaultProps={{ platform, slide, editorial: true }}
            durationInFrames={1}
            fps={30}
            width={platform === 'android' ? 1080 : 1206}
            height={platform === 'android' ? 1920 : 2622}
          />
        )),
      )}
      <Composition
        id="Store-ipad"
        component={StoreArtwork}
        defaultProps={{ tablet: true }}
        durationInFrames={1}
        fps={30}
        width={2064}
        height={2752}
      />
      <Composition
        id="Store-feature"
        component={StoreArtwork}
        defaultProps={{ feature: true }}
        durationInFrames={1}
        fps={30}
        width={1024}
        height={500}
      />
      <Composition
        id="Store-icon"
        component={StoreIcon}
        durationInFrames={1}
        fps={30}
        width={512}
        height={512}
      />
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
