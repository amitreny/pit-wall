// Response shapes for https://api.openf1.org/v1 — field names match the API.

export interface Meeting {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
  location: string;
  country_key: number;
  country_code: string;
  country_name: string;
  country_flag: string | null;
  circuit_key: number;
  circuit_short_name: string;
  circuit_type: string | null;
  circuit_image: string | null;
  circuit_info_url: string | null;
  gmt_offset: string;
  date_start: string;
  date_end: string;
  year: number;
  is_cancelled: boolean;
}

export interface Session {
  session_key: number;
  session_type: string;
  session_name: string;
  date_start: string;
  date_end: string;
  meeting_key: number;
  circuit_key: number;
  circuit_short_name: string;
  country_code: string;
  country_name: string;
  location: string;
  gmt_offset: string;
  year: number;
  is_cancelled: boolean;
}

export interface Driver {
  meeting_key: number;
  session_key: number;
  driver_number: number;
  broadcast_name: string;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string | null;
  first_name: string | null;
  last_name: string | null;
  headshot_url: string | null;
  country_code: string | null;
}

export interface SessionResult {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  position: number | null;
  number_of_laps: number | null;
  /** Only present for races and sprints. */
  points?: number | null;
  duration: number | (number | null)[] | null;
  gap_to_leader: number | string | (number | string | null)[] | null;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
}

export interface StartingGrid {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  position: number;
  lap_duration: number | null;
}

export interface ChampionshipDriver {
  meeting_key: number;
  session_key: number;
  driver_number: number;
  position_start: number | null;
  position_current: number;
  points_start: number;
  points_current: number;
}

export interface ChampionshipTeam {
  meeting_key: number;
  session_key: number;
  team_name: string;
  position_start: number | null;
  position_current: number;
  points_start: number;
  points_current: number;
}

export interface Position {
  date: string;
  session_key: number;
  meeting_key: number;
  driver_number: number;
  position: number;
}

export interface Interval {
  date: string;
  session_key: number;
  meeting_key: number;
  driver_number: number;
  gap_to_leader: number | string | null;
  interval: number | string | null;
}

export interface Lap {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  lap_number: number;
  date_start: string | null;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  segments_sector_1: (number | null)[] | null;
  segments_sector_2: (number | null)[] | null;
  segments_sector_3: (number | null)[] | null;
  i1_speed: number | null;
  i2_speed: number | null;
  st_speed: number | null;
  is_pit_out_lap: boolean;
}

export interface Stint {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  stint_number: number;
  compound: string | null;
  lap_start: number | null;
  lap_end: number | null;
  tyre_age_at_start: number | null;
}

export interface Pit {
  date: string;
  session_key: number;
  meeting_key: number;
  driver_number: number;
  lap_number: number;
  lane_duration: number | null;
  stop_duration: number | null;
  pit_duration: number | null;
}

export interface RaceControl {
  date: string;
  session_key: number;
  meeting_key: number;
  category: string;
  message: string;
  flag: string | null;
  scope: string | null;
  sector: number | null;
  driver_number: number | null;
  lap_number: number | null;
  qualifying_phase: number | null;
}

export interface Weather {
  date: string;
  session_key: number;
  meeting_key: number;
  air_temperature: number;
  track_temperature: number;
  humidity: number;
  pressure: number;
  rainfall: number;
  wind_direction: number;
  wind_speed: number;
}

export interface TeamRadio {
  date: string;
  session_key: number;
  meeting_key: number;
  driver_number: number;
  recording_url: string;
}

export interface CarData {
  date: string;
  session_key: number;
  meeting_key: number;
  driver_number: number;
  speed: number;
  rpm: number;
  n_gear: number;
  throttle: number;
  brake: number;
  drs: number | null;
}

export interface Location {
  date: string;
  session_key: number;
  meeting_key: number;
  driver_number: number;
  x: number;
  y: number;
  z: number;
}

export interface Overtake {
  date: string;
  session_key: number;
  meeting_key: number;
  overtaking_driver_number: number;
  overtaken_driver_number: number;
  position: number;
}

export interface EndpointMap {
  meetings: Meeting;
  sessions: Session;
  drivers: Driver;
  session_result: SessionResult;
  starting_grid: StartingGrid;
  championship_drivers: ChampionshipDriver;
  championship_teams: ChampionshipTeam;
  position: Position;
  intervals: Interval;
  laps: Lap;
  stints: Stint;
  pit: Pit;
  race_control: RaceControl;
  weather: Weather;
  team_radio: TeamRadio;
  car_data: CarData;
  location: Location;
  overtakes: Overtake;
}

export type Endpoint = keyof EndpointMap;
