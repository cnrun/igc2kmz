
import { Coord } from "./coord";
import { Track } from "./track";
import { KML } from "./kml";
import { KMZ, KMZResource } from "./kmz";
import { Bounds, RandomIdGenerator, round, Slice, Utils } from "./util";
import { FlightConvert } from "./init";
import { Task } from "./task";
import { Scale, TimeScale } from "./scale";
import { SimpleCanvas } from "./simplecanvas";

const RIGHTWARDS_ARROW = '->';
const INFINITY = 'inf';
const MULTIPLICATION_SIGN = 'x';
const UP_TACK = 'n/a';

export class Flight {
  track: Track;
  altitude_mode: string;
  color: string;
  width: number;
  pilot_name: string;
  glider_type: string;
  glider_id: string;
  photos: string[] = [];
  url: string = "";
  time_positions: number[] = [];
  files: KMZResource[] = [];
  root: KMZ;
  pcount: number = 0;
  protected id: string = '';
  endconv: ((value: KMZ) => void) | null = null;

  constructor(track: Track) {
    this.track = track;
    this.root = new KMZ([new KML.Folder(this.track.filename, null, [], true)]);
    if (track.elevation_data) {
      this.altitude_mode = 'absolute';
    } else {
      this.altitude_mode = 'clampToGround';
    }
    this.color = "ff0000ff";
    this.width = 2;
    this.pilot_name = track.pilot_name;
    this.glider_type = track.glider_type;
    this.glider_id = track.glider_id;
  }

  get Id(): string {
    if ((this.id ?? "").trim().length > 0) {
      return this.id;
    }
    this.id = RandomIdGenerator.makeid(5);
    return this.id;
  }

  protected endwork() {
    this.pcount--;
    if (this.pcount <= 0 && this.endconv) {
      this.endconv(this.root);
    }
  }

  make_description(globals: FlightConvert): KMZ {
    let rows = [];
    if (this.pilot_name) {
      rows.push(['Pilot name', this.pilot_name]);
    }
    if (this.glider_type) {
      rows.push(['Glider type', this.glider_type]);
    }
    if (this.glider_id) {
      rows.push(['Glider ID', this.glider_id]);
    }
    let take_off_time = new Date(this.track.bounds["time"]?.min.getTime() + globals.tz_offset * 1000); //TOCHECK temps UTC
    rows.push(['Take-off time', take_off_time.toISOString().substring(11, 19)]);
    let landing_time = new Date(this.track.bounds["time"]?.max.getTime() + globals.tz_offset * 1000); //TOCHECK temps UTC
    rows.push(['Landing time', landing_time.toISOString().substring(11, 19)]);
    let duration = (this.track.bounds["time"]?.max.getTime() - this.track.bounds["time"]?.min.getTime()) / 1000;
    let hour = Math.trunc(duration / 3600);
    let seconds = duration % 3600;
    let minute = Math.trunc(seconds / 60);
    let second = Math.trunc(seconds % 60);
    //("0" + hour.toString()).substr(-2)
    rows.push(['Duration', `${hour}h ${("0" + minute.toString()).substr(-2)}m ${("0" + second.toString()).substr(-2)}s`]);
    if (this.track.elevation_data) {
      rows.push(['Take-off altitude', this.track.coords[0].ele + 'm']);
      rows.push(['Maximum altitude', this.track.bounds["ele"]?.max + 'm']);
      rows.push(['Minimum altitude', this.track.bounds["ele"]?.min + 'm']);
      rows.push(['Landing altitude', this.track.coords[this.track.coords.length - 1].ele + 'm']);
      rows.push(['Total altitude gain', this.track.total_dz_positive + 'm']);
      rows.push(['Maximum altitude gain', this.track.max_dz_positive + 'm']);
      rows.push(['Maximum climb', Math.round(this.track.bounds["climb"]?.max * 10) / 10 + 'm/s']);
      rows.push(['Maximum sink', Math.round(this.track.bounds["climb"]?.min * 10) / 10 + 'm/s']);
    }
    rows.push(['Maximum speed', Math.round(this.track.bounds["speed"]?.max * 10) / 10 + 'km/h']);
    if (this.url) {
      let url = new URL(this.url);
      rows.push(['Flight URL', `<a href="${this.url}">${url.hostname}</a>`]);
    }
    let table = Utils.make_table(rows);
    return new KMZ([new KML.CDATA('description', table)]);
  }

  make_snippet(globals: FlightConvert): KMZ {
    //TODO     if (this.xc)
    let date = new Date(this.track.bounds["time"]?.min.getTime() + globals.tz_offset * 1000);
    let strings = [this.pilot_name, date.toISOString().substring(0, 10)];
    return new KMZ([new KML.Snippet(strings.join(', '))]);
  }

  make_task_folder(globals: FlightConvert, task: Task): KMZ {
    //TODO
    return new KMZ([]);
  }

  make_solid_track(globals: FlightConvert, style: KML.Style, altitude_mode: string, name: string, visibility: boolean | null = null, extrude: boolean = false): KMZ {
    let line_string = new KML.LineString(this.track.coords, altitude_mode);
    if (extrude) {
      line_string.add(new KML.SimpleElement('extrude', '1'));
    }
    let placemark = new KML.Placemark(null, line_string, [style]);
    let style_url = globals.stock.check_hide_children_style.url;
    let folder = new KML.Folder(name, style_url, [placemark]);
    if (visibility != null) {
      folder.add(new KML.visibility(visibility));
    }
    return new KMZ([folder]);
  }

  make_colored_track(globals: FlightConvert, values: number[], scale: Scale | null, altitude_mode: string, visibility: boolean, scale_chart: boolean = true): KMZ {
    if (!scale) {
      return new KMZ();
    }
    let folder = new KML.Folder('Colored by ' + scale.title, globals.stock.check_hide_children_style.url, [], null, visibility);
    let styles = scale.colors().map(c => new KML.Style([new KML.LineStyle(c.toHexString(), this.width.toString())])) ?? [];
    let discrete_values: number[] = values.map(v => scale.discretize(v));
    let indexes = Utils.runs(discrete_values);
    for (let i = 0, sl = indexes[0]; i < indexes.length; i++, sl = indexes[i]) {
      let coordinates = this.track.coords.slice(sl.start, sl.stop + 1);
      let line_string = new KML.LineString(coordinates, altitude_mode); //TOFIX : pourquoi pas le param altitude_mode?
      let style_url = styles[discrete_values[sl.start]].url;
      let placemark = new KML.Placemark(null, line_string, [], style_url);
      folder.add(placemark);
    }
    let href = 'images/' + scale.title.replaceAll(' ', '_') + '_scale.png';
    if (scale_chart && scale) {
      if (globals.files.indexOf(href) < 0) {
        globals.files.push(href);
        this.pcount++;
        this.make_scale_chart(globals, scale).then(imgdata => {
          this.root.add_file(href, imgdata);
          this.endwork();
        }).catch(e => {
          console.log(e);
          this.endwork();
        });
      }
      let icon = new KML.Icon([new KML.CDATA('href', href)]);
      let overlay_xy = new KML.overlayXY(0, 'fraction', 1, 'fraction');
      let screen_xy = new KML.screenXY(0, 'fraction', 1, 'fraction');
      let size = new KML.size(0, 'fraction', 0, 'fraction');
      let screen_overlay = new KML.ScreenOverlay([icon, overlay_xy, screen_xy, size]);
      folder.add(screen_overlay);
    }
    return new KMZ([folder]).add_roots(styles);
  }

  make_scale_chart(globals: FlightConvert, scale: Scale | null): Promise<string> {
    return new Promise((res, rej) => {
      if (!globals.canvas) return rej(('no canvas'));
      globals.canvas.create_canvas(50, 200).then(cv => {
        const ctx = cv.getContext('2d');
        if (!ctx || !scale) return rej(('no context'));
        ctx.clearRect(0, 0, cv.width, cv.height);

        ctx.fillStyle = "#ffffff00";
        ctx.fillRect(0, 0, cv.width, cv.height);
        let scalewidth = Math.max(Math.round(scale.range.max).toString().length, Math.round(scale.range.min).toString().length) * 9 + 2;
        ctx.fillStyle = "#ffffffcc";
        ctx.fillRect(0, 0, cv.width - scalewidth, cv.height);

        for (let i = 0; i < 32; i++) {
          let color = scale.color((i * (scale.range.max - scale.range.min) + 0.5) / 32 + scale.range.min)
          ctx.fillStyle = color.toRGBString();
          ctx.fillRect(0, (31 - i) * (cv.height / 32), cv.width - scalewidth, cv.height / 32);
        }
        ctx.strokeStyle = '#ff9f9f9f';
        ctx.fillStyle = '#fff';
        ctx.font = `12pt ${globals.canvas?.fontname}`;
        let nbrgraduations = cv.height / 25;
        for (let i = 0; i < nbrgraduations; i++) {
          let y = i * (cv.height / nbrgraduations);
          let value = Math.round((nbrgraduations - i) * (scale.range.max - scale.range.min) / nbrgraduations + scale.range.min).toString();
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(cv.width - scalewidth + 1, y);
          ctx.stroke();
          ctx.fillText(value, cv.width - scalewidth + 1, y);
        }
        //document.body.append(cv as HTMLCanvasElement);
        (globals.canvas as SimpleCanvas).get_base64(cv).then(v => res(v));
      });
    });
  }

  make_graph_chart(globals: FlightConvert, values: number[], scale: Scale | null): Promise<string> {
    return new Promise((res, rej) => {
      if (!globals.canvas) return rej(('no canvas'));
      globals.canvas.create_canvas(globals.graph_width, globals.graph_height).then(cv => {
        const ctx = cv.getContext('2d');
        let timescale = globals.scales["time"] as TimeScale;
        if (!ctx || !(timescale instanceof TimeScale) || !scale) return rej(('no context'));
        ctx.clearRect(0, 0, cv.width, cv.height);

        /*ctx.fillStyle = "#ffffff00";
        ctx.fillRect(0, 0, cv.width, cv.height);
        let margin = 5;
        ctx.fillStyle = "#ffffffcc";
        ctx.fillRect(margin, margin, cv.width - margin, cv.height - margin);
        ctx.fillStyle = '#0000ff00';
        ctx.font = `12pt ${globals.canvas?.fontname} bold`;
        // axe horizontal (temps)   //timescale.positions == [3550, 3563, 3575, 3588, 0, 13, 25, 38, 50, 63, 75, 88]
        let increment = cv.width / timescale.labels.length;
        for (let i = 0; i < timescale.labels.length; i++) {
          ctx.fillText(timescale.labels[i], i * increment, cv.height - 12);
        }
        // axe vertical (altitude)
        //scale.range.min
        increment = cv.height / (scale.range.max - scale.range.min);
        //for (let i = 0; i < y.length; i++) {
          //ctx.fillText(timescale.labels[i], 1, y[i]);
        //}
        let y = values.map(v => globals.graph_height * (v - scale.range.min) / (scale.range.max - scale.range.min));
        let indexes = Utils.incr_douglas_peucker(this.time_positions, y, 1, 450);
        ctx.strokeStyle = '#9f9f9f';
        ctx.beginPath();
        ctx.moveTo(margin, y[indexes[0]]);
        increment = (cv.width - 2 * margin) / indexes.length;
        for (let i = 1; i < indexes.length; i++) {
          //ctx.fillText(timescale.labels[i], 1, i * increment);
          ctx.lineTo(margin + increment * i, y[indexes[i]]);
        }
        ctx.stroke();
        document.body.append(cv as HTMLCanvasElement);*/
        (globals.canvas as SimpleCanvas).get_base64(cv).then(v => res(v));
      });
    });
  }

  make_track_folder(globals: FlightConvert): KMZ {
    let style_url = globals.stock.radio_folder_style.url;
    let folder = new KMZ([new KML.Folder('Track', style_url, [], true)]);
    folder.add([globals.stock.invisible_none_folder]);
    let visibility: boolean;
    if (this.track.elevation_data) {
      visibility = globals.default_track == 'climb';
      folder.add([this.make_colored_track(globals, this.track.climb, globals.scales["climb"], 'absolute', visibility)]);
      visibility = globals.default_track == 'altitude';
      folder.add([this.make_colored_track(globals, this.track.ele, globals.scales["altitude"], 'absolute', visibility)]);
      visibility = globals.default_track == 'tec';
      folder.add([this.make_colored_track(globals, this.track.tec, globals.scales["tec"], 'absolute', visibility)]);
    }
    visibility = globals.default_track == 'speed';
    folder.add([this.make_colored_track(globals, this.track.speed, globals.scales["speed"], this.altitude_mode, visibility)]);
    // TODO
    /*if (this.track.bounds["tas"] != null) {
      visibility = globals.default_track == 'tas';
      folder.add([this.make_colored_track(globals, this.track.tas, globals.scales["tas"], this.altitude_mode, visibility)]);
    }*/
    visibility = globals.default_track == 'time';
    folder.add([this.make_colored_track(globals, this.track.t, globals.scales["t"], this.altitude_mode, visibility, false)]);
    visibility = globals.default_track == 'solid_color';
    let style = new KML.Style([new KML.LineStyle(this.color, this.width.toString())]);
    folder.add([this.make_solid_track(globals, style, this.altitude_mode, 'Solid color', visibility)]);
    return folder;
  }

  make_shadow_folder(globals: FlightConvert): KMZ {
    if (!this.track.elevation_data) {
      return new KMZ();
    }
    let style_url = globals.stock.radio_folder_style.url;
    let folder = new KMZ([new KML.Folder('Shadow', style_url, [], false)]);
    folder.add([globals.stock.invisible_none_folder]);
    let style = new KML.Style([new KML.LineStyle('ff000000', '1')]);
    folder.add([this.make_solid_track(globals, style, 'clampToGround', 'Normal')]);
    let line_style = new KML.LineStyle('00000000', '1');
    let poly_style = new KML.PolyStyle([new KML.SimpleElement('color', '80000000'), new KML.SimpleElement('width', '1')]);
    style = new KML.Style([line_style, poly_style]);
    folder.add([this.make_solid_track(globals, style, 'absolute', 'Extrude', false, true)]);
    style = new KML.Style([new KML.LineStyle(this.color, this.width.toString())]);
    folder.add([this.make_solid_track(globals, style, 'clampToGround', 'Solid color', false)]);
    return folder;
  }

  make_animation_tour(globals: FlightConvert): KML.Element {
    let style_url = globals.stock.radio_folder_style.url;
    let result = new KML.Folder('Animation', style_url, [], false);
    let line_style = new KML.Style([new KML.LineStyle('bf00aaff', '2')]);
    result.add(line_style);
    let tour: KML.Tour = new KML.Tour('Double-click here to start tour', 1);
    result.add(tour);
    style_url = globals.stock.check_hide_children_style.url;
    let folder = new KML.Folder('Path segments', style_url, [], false);
    let placemarks: KML.Placemark[] = [];
    let line_string = new KML.LineString(this.track.coords.slice(0, 2), this.altitude_mode);
    line_string.add(new KML.SimpleElement('tessellate', '1'));
    let placemark = new KML.Placemark('1', line_string, [], line_style.url, false, false);
    placemarks.push(placemark);
    tour.add_update(placemark.Id);
    for (let i = 1; i < this.track.coords.length; i++) {
      //coord = this.track.coords[i - 1].halfway_to(this.track.coords[i]);
      line_string = new KML.LineString(this.track.coords.slice(i, i + 2), this.altitude_mode);
      line_string.add(new KML.SimpleElement('tessellate', '1'));
      placemark = new KML.Placemark(null, line_string, [], line_style.url, false, false);
      placemarks.push(placemark);
      tour.add_update(placemark.Id);
    }
    placemarks.forEach(placemark => folder.add(placemark));
    result.add(folder);
    return result;
  }

  make_animation(globals: FlightConvert): KMZ {
    let icon_style = new KML.IconStyle([globals.stock.animation_icon, new KML.color(this.color), new KML.scale(globals.stock.icon_scales[0].toString())]);
    let list_style = new KML.ListStyle('checkHideChildren');
    let line_style = new KML.LineStyle('ff009bff', this.width.toString());
    let style = new KML.Style([icon_style, list_style, line_style]);
    let folder = new KML.Folder('Animation', null, [style], null, false);
    let point = new KML.Point(this.track.coords[0], this.altitude_mode);
    let timespan = new KML.TimeSpan(null, this.track.coords[0].dt);
    let placemark = new KML.Placemark(null, point, [timespan], style.url);
    folder.add(placemark);
    for (let i = 1; i < this.track.coords.length - 1; i++) {
      let coord = this.track.coords[i - 1].halfway_to(this.track.coords[i]);
      point = new KML.Point(coord, this.altitude_mode);
      let line_string = new KML.LineString([this.track.coords[i - 1], this.track.coords[i]], 'absolute');
      timespan = new KML.TimeSpan(this.track.coords[i - 1].dt, this.track.coords[i].dt);
      placemark = new KML.Placemark(null, point, [timespan], style.url);
      //placemark.add(new KML.SimpleElement('name', this.track.pilot_name));
      folder.add(placemark);
      timespan = new KML.TimeSpan(this.track.coords[i].dt, new Date(this.track.coords[i].dt.getTime() + 60000));
      placemark = new KML.Placemark(null, line_string, [timespan], style.url);
      folder.add(placemark);
    }
    point = new KML.Point(this.track.coords[this.track.coords.length - 1], this.altitude_mode);
    let line_string = new KML.LineString(this.track.coords.slice(this.track.indexOf(new Date(this.track.coords[this.track.coords.length - 1].dt.getTime() - 60000)), this.track.coords.length - 1), 'absolute');
    timespan = new KML.TimeSpan(this.track.coords[this.track.coords.length - 1].dt);
    placemark = new KML.Placemark(null, point, [timespan], style.url);
    folder.add(placemark);
    placemark = new KML.Placemark(null, line_string, [timespan], style.url);
    folder.add(placemark);
    return new KMZ([folder]);
  }

  make_photos_folder(globals: FlightConvert): KMZ {
    //TODO
    return new KMZ();
  }

  make_xc_folder(globals: FlightConvert): KMZ {
    //TODO
    return new KMZ();
  }

  make_placemark(globals: FlightConvert, coord: Coord, altitudeMode: string, name: string, style_url: string): KML.Element {
    let point = new KML.Point(coord, altitudeMode);
    return new KML.Placemark(name, point, [new KML.Snippet()], style_url);
  }

  make_altitude_marks_folder(globals: FlightConvert): KMZ {
    if (!this.track.elevation_data) {
      return new KMZ();
    }
    let style_url = globals.stock.check_hide_children_style.url;
    let folder = new KML.Folder('Altitude marks', style_url, [], null, false);
    Utils.salient2(this.track.coords.map(c => c.ele), [100, 50, 10]).forEach((j, index) => {
      let coord = this.track.coords[index];
      let i: number = globals.scales.altitude?.discretize(coord.ele) ?? 0;
      style_url = globals.altitude_styles[j][i].url;
      folder.add(this.make_placemark(globals, coord, 'absolute', `${coord.ele}m`, style_url));
    });
    return new KMZ([folder]);
  }

  make_graph(globals: FlightConvert, values: number[], scale: Scale): KML.Element {
    if (!globals.canvas) {
      return new KML.Comment('Error while generating graph');
    }
    let href = 'images/' + scale.title.replaceAll(' ', '_') + '_' + this.Id + '_graph.png';
    this.pcount++;
    this.make_graph_chart(globals, values, scale).then(imgdata => {
      this.root.add_file(href, imgdata);
      this.endwork();
    }).catch(e => {
      console.log(e);
      this.endwork();
    });
    /*if (!imgdata) {
      return new KML.Comment('Error while generating graph');
    }*/
    let icon = new KML.Icon([new KML.CDATA('href', href)]);
    let overlay_xy = new KML.overlayXY(0, 'fraction', 0, 'fraction');
    let screen_xy = new KML.screenXY(0, 'fraction', 16, 'pixels');
    let size = new KML.size(0, 'fraction', 0, 'fraction');
    let screen_overlay = new KML.ScreenOverlay([icon, overlay_xy, screen_xy, size]);
    let style_url = globals.stock.check_hide_children_style.url;
    let name = Utils.capitalizeFirstLetter(scale.title) + ' graph (TODO)'
    let folder = new KML.Folder(name, style_url, [screen_overlay], null, false);
    return folder;
  }

  make_analysis_folder(globals: FlightConvert, title: string, slices: Slice[], style_url: string): KMZ {
    if (!this.track.elevation_data || slices.length <= 0) {
      return new KMZ();
    }
    let folder_style_url = globals.stock.check_hide_children_style.url
    let folder = new KML.Folder(Utils.capitalizeFirstLetter(title) + 's', folder_style_url, null, null, false);
    for (let k = 0, sl = slices[0]; k < slices.length; k++, sl = slices[k]) {
      let coord0 = this.track.coords[sl.start];
      let coord1 = this.track.coords[sl.stop];
      let coord = coord0.halfway_to(coord1);
      let point = new KML.Point(coord, 'absolute');
      let total_dz_positive = 0, total_dz_negative = 0;
      let peak_climb = new Bounds(0);
      for (let i = sl.start; i < sl.stop; i++) {
        let dz = this.track.coords[i + 1].ele - this.track.coords[i].ele;
        let dt = this.track.t[i + 1] - this.track.t[i];
        if (dz > 0) {
          total_dz_positive += dz;
        } else if (dz < 0) {
          total_dz_negative += dz;
        }
        peak_climb.update(dz / dt);
      }
      let climb = new Bounds(this.track.climb.slice(sl.start, sl.stop));
      let dz = this.track.coords[sl.stop].ele - this.track.coords[sl.start].ele;
      let dt = this.track.t[sl.stop] - this.track.t[sl.start];
      let dp = coord0.distance_to(coord1);
      let theta = coord0.initial_bearing_to(coord1);
      let dict: Record<string, string | number> = {};
      dict['altitude_change'] = round(dz);
      dict['average_climb'] = round(dz / dt, 1);
      dict['maximum_climb'] = round(climb.max, 1);
      dict['peak_climb'] = round(peak_climb.max, 1);
      let divisor = dt * climb.max;
      if (divisor == 0) {
        dict['efficiency'] = UP_TACK;
      } else {
        dict['efficiency'] = round(100.0 * dz / divisor);
      }
      dict['distance'] = round(dp / 1000.0, 1);
      let average_ld = dz < 0 ? round(-dp / dz, 1).toString() : INFINITY;
      dict['average_ld'] = average_ld;
      dict['average_speed'] = round(3.6 * dp / dt, 1);
      dict['maximum_descent'] = round(climb.min, 1);
      dict['peak_descent'] = round(peak_climb.min, 1);
      dict['start_altitude'] = coord0.ele;
      dict['finish_altitude'] = coord1.ele;
      let start_time = new Date(coord0.dt.getTime() + globals.tz_offset * 1000);
      dict['start_time'] = start_time.toISOString().substring(11, 19);
      let stop_time = new Date(coord1.dt.getTime() + globals.tz_offset * 1000);
      dict['finish_time'] = stop_time.toISOString().substring(11, 19);
      let duration = this.track.t[sl.stop] - this.track.t[sl.start];
      let seconds = ("0" + Math.trunc(duration % 60).toString()).substr(-2);
      dict['duration'] = `${Math.trunc(duration / 60)}m ${seconds}ds`;
      dict['accumulated_altitude_gain'] = total_dz_positive;
      dict['accumulated_altitude_loss'] = total_dz_negative;
      dict['drift_direction'] = Coord.rad_to_cardinal(theta + Math.PI);
      let extended_data = new KML.ExtendedData(dict);
      let name: string = '';
      if (title == 'thermal') {
        name = `${round(dz)}m at ${round(dz / dt, 1)}m/s`;
      } else if (title == 'glide') {
        name = `${round(dp / 1000, 1)}km at ${average_ld}:1, ${round(3.6 * dp / dt)}km/h`;
      } else if (title == 'dive') {
        name = `${-1 * round(-dz)}m at ${round(dz / dt, 1)}m/s`;
      }
      let placemark = new KML.Placemark(name, point, [extended_data], style_url);
      folder.add(placemark);
      let line_string = new KML.LineString([coord0, coord1], 'absolute');
      placemark = new KML.Placemark(null, line_string, null, style_url);
      folder.add(placemark);
    }
    return new KMZ([folder]);
  }

  make_time_mark(globals: FlightConvert, coord: Coord, dt: Date, style_url: string): KML.Element {
    let point = new KML.Point(coord, this.altitude_mode);
    let name = new Date(dt.getTime() + globals.tz_offset * 1000).toISOString().substring(11, 16);
    return new KML.Placemark(name, point, [], style_url);
  }

  make_time_marks_folder(globals: FlightConvert, step: number = 300): KML.Folder {
    let style_url = globals.stock.check_hide_children_style.url;
    let folder = new KML.Folder('Time marks', style_url, [], null, false);
    let coord = this.track.coords[0];
    style_url = globals.stock.time_mark_styles[0].url;
    folder.add(this.make_time_mark(globals, coord, coord.dt, style_url));
    let dt = Utils.datetime_floor(this.track.coords[0].dt, step);
    while (dt <= this.track.coords[0].dt) {
      dt = new Date(dt.getTime() + step * 1000);
    }
    while (dt < this.track.coords[this.track.coords.length - 1].dt) {
      coord = this.track.coord_at(dt);
      let style_index = 3;
      if (dt.getMinutes() == 0) {
        style_index = 0;
      } else if (dt.getMinutes() == 30) {
        style_index = 1;
      } else if (dt.getMinutes() == 15 || dt.getMinutes() == 45) {
        style_index = 2;
      }
      style_url = globals.stock.time_mark_styles[style_index].url;
      folder.add(this.make_time_mark(globals, coord, dt, style_url));
      dt = new Date(dt.getTime() + step * 1000);
    }
    coord = this.track.coords[this.track.coords.length - 1];
    style_url = globals.stock.time_mark_styles[0].url;
    folder.add(this.make_time_mark(globals, coord, coord.dt, style_url));
    return folder;
  }

  to_kmz(globals: FlightConvert): Promise<KMZ> {
    return new Promise((res, rej) => {
      this.endconv = res;
      this.pcount++;
      if (globals.scales["time"] != null) {
        let maxtimescale = globals.scales["time"]?.range.max.getTime() / 1000;
        let mintimescale = globals.scales["time"]?.range.min.getTime() / 1000;
        this.time_positions = this.track.t.map(t => Math.trunc(globals.graph_width * (t - mintimescale) / (maxtimescale - mintimescale)));
      }
      this.root.add([this.make_description(globals)]);
      this.root.add([this.make_snippet(globals)]);
      if (this.track.declaration) {
        this.root.add([this.make_task_folder(globals, this.track.declaration)]);
      }
      this.root.add([this.make_track_folder(globals)]);
      this.root.add([this.make_shadow_folder(globals)]);
      this.root.add([this.make_animation(globals)]);
      //this.root.add([this.make_animation_tour(globals)]);
      this.root.add([this.make_photos_folder(globals)]);
      this.root.add([this.make_xc_folder(globals)]);
      this.root.add([this.make_altitude_marks_folder(globals)]);
      if (this.track.elevation_data && globals.scales["altitude"]) {
        let eles: number[] = this.track.coords.map(c => c.ele);
        this.root.add([this.make_graph(globals, eles, globals.scales["altitude"])]);
      }
      this.root.add([this.make_analysis_folder(globals, 'thermal', this.track.thermals, globals.stock.thermal_style.url)]);
      this.root.add([this.make_analysis_folder(globals, 'glide', this.track.glides, globals.stock.glide_style.url)]);
      this.root.add([this.make_analysis_folder(globals, 'dive', this.track.dives, globals.stock.dive_style.url)]);
      this.root.add([this.make_time_marks_folder(globals)]);
      this.endwork();
    });
  }
}
