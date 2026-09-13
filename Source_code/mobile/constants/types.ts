export interface Violation {
  id: number;
  camera_id: number;
  camera_name: string;
  violation_type: string;
  image_url: string;
  detected_at: string;
  status: string;
  identities?: string;
  location_detail?: string;
}
