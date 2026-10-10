/** @typedef {{id:string,profileId:string,profileName:string,deviceId:string,day:string,format:string,schema?:string,bytes:number,created:number,shared:boolean}} StoredExport */
/** @typedef {{deviceId:string,profileId:string,name:string,shared:boolean,selection:Record<string,string[]>}} Profile */
/** @typedef {{client:string,blocked:boolean,lastSeen:number}} Agent */
/** @typedef {{account:string,exports:StoredExport[],profiles:Profile[],agents:Agent[],devices:{id:string,name:string}[]}} Workspace */
/** @typedef {{records:{domain:string,type:string,source:string,start:string|null,end:string|null,native:unknown}[],nextCursor:string|null,manifest:Record<string,unknown>}} RecordPage */

/** @param {Workspace} workspace @param {string} id */
export function deviceName(workspace, id) {
  return workspace.devices.find((device) => device.id === id)?.name ?? 'Disconnected phone';
}
