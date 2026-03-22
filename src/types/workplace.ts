export interface StorePosition {
  id: string;
  store_id: string;
  position_key: string;
  label: string;
  display_order: number;
}

export interface WorkLocation {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  is_gps_required: boolean;
  work_location_key: string;
  label: string;
  color: string;
  bg_color: string;
  display_order: number;
  positions: StorePosition[];
}
