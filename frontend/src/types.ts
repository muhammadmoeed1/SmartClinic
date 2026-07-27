// ---------------------------------------------------------------------------
// DTOs matching docs/API_CONTRACT.md exactly
// ---------------------------------------------------------------------------

export type Role = 'patient' | 'doctor' | 'receptionist' | 'admin';

export interface DoctorProfile {
  specialty: string;
  bio: string | null;
}

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  doctorProfile?: DoctorProfile;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export interface DoctorDto {
  id: string; // the doctor's user id
  fullName: string;
  specialty: string;
  bio: string | null;
  avgRating?: number | null;
  ratingCount?: number;
}

export interface RoomDto {
  id: string;
  name: string;
  branch: string;
}

// --- Appointments -----------------------------------------------------------

export type AppointmentStatus =
  | 'scheduled'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface RatingDto {
  score: number;
  comment: string | null;
}

export interface AppointmentDto {
  id: string;
  patientId: string;
  doctorId: string;
  patient: { id: string; fullName: string; phone: string | null };
  doctor: { id: string; fullName: string; specialty: string };
  startTime: string; // ISO
  endTime: string; // ISO
  status: AppointmentStatus;
  reason: string | null;
  noShowRisk?: number;
  rating?: RatingDto;
}

export interface SlotDto {
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface WaitlistEntryDto {
  id: string;
  doctorId: string;
  date: string;
  position: number;
}

export interface WaitlistListEntryDto {
  id: string;
  date: string;
  createdAt: string;
  patient: { id: string; fullName: string; phone: string | null };
  doctor: { id: string; fullName: string; specialty?: string };
}

// --- Medical records --------------------------------------------------------

export interface IcdCode {
  code: string;
  description: string;
}

export interface RecordFileDto {
  id: string;
  filename: string;
  size: number;
  mimetype: string;
}

export interface VisitRecordDto {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  icdCodes: IcdCode[];
  finalized: boolean;
  createdAt: string;
  updatedAt: string;
  patient?: { id: string; fullName: string };
  doctor?: { id: string; fullName: string; specialty?: string };
  appointment?: { startTime: string; status: AppointmentStatus };
  files: RecordFileDto[];
}

// --- AI ---------------------------------------------------------------------

export type Confidence = 'low' | 'medium' | 'high';

export interface RecommendResponse {
  specialty: string;
  rationale: string;
  confidence: Confidence;
  doctors: Array<{ id: string; fullName: string; specialty: string }>;
}

export interface IntakeStartResponse {
  sessionId: string;
  message: string;
}

export interface TriageSummary {
  chiefComplaint: string;
  symptomDurationDays: number;
  severity: number; // 1-10
  relevantHistory: string;
  currentMedications: string;
  redFlags: string[];
}

export interface IntakeMessageResponse {
  message: string;
  completed: boolean;
  summary?: TriageSummary;
}

export interface TriageResponse {
  summary: TriageSummary;
  createdAt: string;
}

export interface SoapFormatResponse {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  icdSuggestions: IcdCode[]; // max 3
}

export interface NoShowRiskDto {
  appointmentId: string;
  score: number; // 0..1, flag when > 0.65
  factors: string[];
}

export interface ReminderResponse {
  sent: boolean;
  channel: string;
  to: string;
}

// --- Insurance pre-auth -----------------------------------------------------

export type InsuranceProvider = 'MedGulf' | 'AXA' | 'Bupa';
export type PreAuthStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

export interface PreAuthDto {
  id: string;
  appointmentId: string;
  appointment: AppointmentDto;
  provider: InsuranceProvider;
  status: PreAuthStatus;
  diagnosisCode: string;
  notes: string | null;
  createdAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
}

// --- Notifications ----------------------------------------------------------

export interface NotificationDto {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

// --- Analytics --------------------------------------------------------------

export interface OccupancyRow {
  doctorId: string;
  doctorName: string;
  specialty: string;
  booked: number;
  capacity: number;
  rate: number;
}

export interface NoShowTrendRow {
  date: string;
  total: number;
  noShows: number;
  rate: number;
}

export interface ConsultationDurationRow {
  specialty: string;
  avgMinutes: number;
}

export interface InsuranceStatsRow {
  provider: string;
  total: number;
  approved: number;
  rejected: number;
  approvalRate: number;
  avgTurnaroundHours: number;
}

// --- AI observability ---------------------------------------------------------

export interface LlmFeatureStats {
  feature: string;
  calls: number;
  successRate: number;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface RagCacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

export interface ObservabilityResponse {
  llmCalls: LlmFeatureStats[];
  ragCache: RagCacheStats;
}

// --- System health ------------------------------------------------------------

export interface HealthResponse {
  status: string;
  db: string;
  uptime: number;
  timestamp: string;
}

export interface SystemHealthSummary {
  uptimeSeconds: number;
  nodeVersion: string;
  totalRequests: number;
  memoryMb: number;
  cpuSeconds: number;
  eventLoopLagMs: number;
}

// --- Errors -----------------------------------------------------------------

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}
