
//ZIP : https://stackoverflow.com/a/49836948
//typescript? https://code.visualstudio.com/docs/languages/typescript
//vs code task : https://code.visualstudio.com/docs/editor/tasks


import IGCParser = require("igc-parser")
import { KMZ } from "./kmz";
import { Flight, FlightConvert } from "./init";
import { Track } from "./track";

export function igc2kmz(igccontent: string): KMZ | null {
  let igc = IGCParser.parse(igccontent);
  let flight = new Flight(new Track(igc));
  //console.log(flight);
  let cv = new FlightConvert();
  // TODO root KML
  // TODO chargement Task.from_file(open(options.task)) if options.task else None
  let kmz = cv.flights2kmz([flight]);
  if (kmz) {
    kmz.download(kmz.getKMZ(2.2));
  }
  return kmz;
  //let kmz: KMZ = new KMZ();
  //let zip = kmz.getKMZ();
  //kmz.download(zip);
  //return kmz;
}
