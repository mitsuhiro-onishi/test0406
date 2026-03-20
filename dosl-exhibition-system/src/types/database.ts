export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Exhibition {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "draft" | "published" | "closed" | "archived";
  start_date: string;
  end_date: string;
  venue_name: string | null;
  venue_address: string | null;
  form_fields: Record<string, FormFieldConfig>;
  industry_options: string[];
  purpose_options: string[];
  branding: BrandingConfig;
  features: FeaturesConfig;
  email_settings: EmailSettings;
  max_registrations: number | null;
  created_at: string;
  updated_at: string;
}

export interface FormFieldConfig {
  visible: boolean;
  required: boolean;
  label?: string;
  max?: number;
}

export interface BrandingConfig {
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  banner_url: string | null;
  copyright: string | null;
}

export interface FeaturesConfig {
  seminar: boolean;
  companion: boolean;
  entry_number: boolean;
  badge_print: boolean;
  exit_tracking: boolean;
}

export interface EmailSettings {
  from_name: string;
  reply_to: string | null;
  confirmation_subject: string;
  reminder_enabled: boolean;
  reminder_days_before: number;
}

export interface RegistrationType {
  id: string;
  exhibition_id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  requires_code: boolean;
  sort_order: number;
  created_at: string;
}

export interface Visitor {
  id: string;
  email: string;
  last_name: string;
  first_name: string;
  last_name_kana: string | null;
  first_name_kana: string | null;
  company_name: string | null;
  company_kana: string | null;
  department: string | null;
  position: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface Registration {
  id: string;
  exhibition_id: string;
  visitor_id: string;
  registration_type_id: string | null;
  ticket_code: string;
  status: "confirmed" | "cancelled" | "waitlisted";
  industry: string | null;
  visit_purpose: string[] | null;
  entry_number: string | null;
  custom_fields: Record<string, unknown>;
  companions: Companion[];
  qr_sent_at: string | null;
  reminder_sent_at: string | null;
  registered_at: string;
  updated_at: string;
}

export interface Companion {
  name: string;
  name_kana?: string;
  company?: string;
}

export interface Seminar {
  id: string;
  exhibition_id: string;
  title: string;
  description: string | null;
  speaker_name: string | null;
  speaker_title: string | null;
  venue_name: string | null;
  capacity: number | null;
  starts_at: string;
  ends_at: string;
  status: "draft" | "open" | "closed" | "cancelled";
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EntryLog {
  id: string;
  registration_id: string;
  action: "entry" | "exit";
  gate: string | null;
  method: "qr" | "manual" | "walk_in";
  scanned_by: string | null;
  logged_at: string;
}

// 登録フォームの入力型
export interface RegistrationFormData {
  email: string;
  last_name: string;
  first_name: string;
  last_name_kana?: string;
  first_name_kana?: string;
  company_name?: string;
  company_kana?: string;
  department?: string;
  position?: string;
  phone?: string;
  postal_code?: string;
  address?: string;
  industry?: string;
  visit_purpose?: string[];
  registration_type_slug?: string;
  companions?: Companion[];
  seminar_ids?: string[];
}

// 登録APIレスポンス
export interface RegistrationResponse {
  success: boolean;
  ticket_code?: string;
  registration_id?: string;
  error?: string;
}

// 登録者一覧（JOINした型）
export interface RegistrationWithVisitor extends Registration {
  visitor: Visitor;
  registration_type?: RegistrationType;
  entry_logs?: EntryLog[];
}
