import { prepareLaunchVideo } from '../launch-video/prepare.js';

const { publicDirectory } = await prepareLaunchVideo();
console.log(`Prepared video assets: ${publicDirectory}`);
