// Generated from the executed office SQL migration. Run node scripts/generate-office-types.mjs
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type Database = { public: { Tables: {
 activity_logs: { Row: {
  id: string;
  organization_id: string;
  actor_id: string | null;
  action: string;
  entity_id: string | null;
  details: Json;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  actor_id?: string | null;
  action: string;
  entity_id?: string | null;
  details?: Json;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['activity_logs']['Insert']>; Relationships: [] };
 agent_configs: { Row: {
  id: string;
  organization_id: string;
  agent_id: string;
  provider_id: string;
  model: string;
  system_prompt: string;
  allowed_tools: string[];
  memory_scope: string;
  max_iterations: number;
  max_output_tokens: number;
  input_micro_usd_per_million: number;
  output_micro_usd_per_million: number;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  agent_id: string;
  provider_id: string;
  model: string;
  system_prompt: string;
  allowed_tools?: string[];
  memory_scope?: string;
  max_iterations?: number;
  max_output_tokens?: number;
  input_micro_usd_per_million: number;
  output_micro_usd_per_million: number;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['agent_configs']['Insert']>; Relationships: [] };
 agent_events: { Row: {
  id: string;
  organization_id: string;
  agent_id: string | null;
  run_id: string | null;
  event_key: string;
  kind: string;
  payload: Json;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  agent_id?: string | null;
  run_id?: string | null;
  event_key: string;
  kind: string;
  payload?: Json;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['agent_events']['Insert']>; Relationships: [] };
 agent_memories: { Row: {
  id: string;
  organization_id: string;
  agent_id: string;
  key: string;
  content: string;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  agent_id: string;
  key: string;
  content: string;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['agent_memories']['Insert']>; Relationships: [] };
 agent_messages: { Row: {
  id: string;
  organization_id: string;
  conversation_id: string;
  sender_user_id: string | null;
  sender_agent_id: string | null;
  recipient_agent_id: string | null;
  parent_id: string | null;
  content: string;
  kind: string;
  metadata: Json;
  legacy_source: string | null;
  legacy_id: number | null;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  conversation_id: string;
  sender_user_id?: string | null;
  sender_agent_id?: string | null;
  recipient_agent_id?: string | null;
  parent_id?: string | null;
  content: string;
  kind?: string;
  metadata?: Json;
  legacy_source?: string | null;
  legacy_id?: number | null;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['agent_messages']['Insert']>; Relationships: [] };
 agent_runs: { Row: {
  id: string;
  organization_id: string;
  project_id: string;
  task_id: string;
  agent_id: string;
  status: string;
  iteration: number;
  checkpoint: Json;
  error: string | null;
  idempotency_key: string;
  requested_by: string;
  reserved_micro_usd: number;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  project_id: string;
  task_id: string;
  agent_id: string;
  status?: string;
  iteration?: number;
  checkpoint?: Json;
  error?: string | null;
  idempotency_key: string;
  requested_by: string;
  reserved_micro_usd?: number;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['agent_runs']['Insert']>; Relationships: [] };
 agent_sessions: { Row: {
  id: string;
  organization_id: string;
  agent_id: string;
  project_id: string;
  external_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  agent_id: string;
  project_id: string;
  external_id?: string | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['agent_sessions']['Insert']>; Relationships: [] };
 agent_tool_calls: { Row: {
  id: string;
  organization_id: string;
  run_id: string;
  call_key: string;
  tool: string;
  input: Json;
  input_hash: string;
  status: string;
  output: Json | null;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  run_id: string;
  call_key: string;
  tool: string;
  input: Json;
  input_hash: string;
  status: string;
  output?: Json | null;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['agent_tool_calls']['Insert']>; Relationships: [] };
 agents: { Row: {
  id: string;
  organization_id: string;
  name: string;
  role: string;
  avatar_url: string | null;
  status: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  name: string;
  role: string;
  avatar_url?: string | null;
  status?: string;
  enabled?: boolean;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['agents']['Insert']>; Relationships: [] };
 approvals: { Row: {
  id: string;
  organization_id: string;
  run_id: string;
  tool_call_id: string;
  kind: string;
  summary: string;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  run_id: string;
  tool_call_id: string;
  kind: string;
  summary: string;
  status?: string;
  decided_by?: string | null;
  decided_at?: string | null;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['approvals']['Insert']>; Relationships: [] };
 budgets: { Row: {
  id: string;
  organization_id: string;
  project_id: string;
  limit_micro_usd: number;
  spent_micro_usd: number;
  reserved_micro_usd: number;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  project_id: string;
  limit_micro_usd: number;
  spent_micro_usd?: number;
  reserved_micro_usd?: number;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['budgets']['Insert']>; Relationships: [] };
 conversation_members: { Row: {
  id: string;
  organization_id: string;
  conversation_id: string;
  user_id: string | null;
  agent_id: string | null;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  conversation_id: string;
  user_id?: string | null;
  agent_id?: string | null;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['conversation_members']['Insert']>; Relationships: [] };
 conversations: { Row: {
  id: string;
  organization_id: string;
  project_id: string;
  title: string;
  kind: string;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  project_id: string;
  title: string;
  kind?: string;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['conversations']['Insert']>; Relationships: [] };
 expenses: { Row: {
  id: string;
  organization_id: string;
  project_id: string;
  category: string;
  description: string;
  amount_micro_usd: number;
  incurred_at: string;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  project_id: string;
  category: string;
  description: string;
  amount_micro_usd: number;
  incurred_at?: string;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['expenses']['Insert']>; Relationships: [] };
 model_providers: { Row: {
  id: string;
  organization_id: string;
  name: string;
  adapter: string;
  credential_env: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  name: string;
  adapter: string;
  credential_env: string;
  enabled?: boolean;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['model_providers']['Insert']>; Relationships: [] };
 model_usage: { Row: {
  id: string;
  organization_id: string;
  run_id: string;
  request_key: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_micro_usd: number;
  pricing: Json;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  run_id: string;
  request_key: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_micro_usd: number;
  pricing: Json;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['model_usage']['Insert']>; Relationships: [] };
 notifications: { Row: {
  id: string;
  organization_id: string;
  user_id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  user_id: string;
  title: string;
  body?: string;
  read_at?: string | null;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['notifications']['Insert']>; Relationships: [] };
 office_assets: { Row: {
  id: string;
  organization_id: string;
  name: string;
  storage_path: string;
  license: string;
  source_url: string;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  name: string;
  storage_path: string;
  license: string;
  source_url: string;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['office_assets']['Insert']>; Relationships: [] };
 office_layouts: { Row: {
  id: string;
  organization_id: string;
  name: string;
  layout: Json;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  name: string;
  layout?: Json;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['office_layouts']['Insert']>; Relationships: [] };
 organization_members: { Row: {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  user_id: string;
  role: string;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['organization_members']['Insert']>; Relationships: [] };
 organizations: { Row: {
  id: string;
  name: string;
  created_by: string;
  stopped: boolean;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  name: string;
  created_by: string;
  stopped?: boolean;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['organizations']['Insert']>; Relationships: [] };
 profiles: { Row: {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id: string;
  display_name?: string;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['profiles']['Insert']>; Relationships: [] };
 project_documents: { Row: {
  id: string;
  organization_id: string;
  project_id: string;
  title: string;
  content: string;
  storage_path: string | null;
  version: number;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  project_id: string;
  title: string;
  content?: string;
  storage_path?: string | null;
  version?: number;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['project_documents']['Insert']>; Relationships: [] };
 project_members: { Row: {
  id: string;
  organization_id: string;
  project_id: string;
  user_id: string;
  role: string;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  project_id: string;
  user_id: string;
  role?: string;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['project_members']['Insert']>; Relationships: [] };
 project_memories: { Row: {
  id: string;
  organization_id: string;
  project_id: string;
  key: string;
  content: string;
  source_run_id: string | null;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  project_id: string;
  key: string;
  content: string;
  source_run_id?: string | null;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['project_memories']['Insert']>; Relationships: [] };
 project_repositories: { Row: {
  id: string;
  organization_id: string;
  project_id: string;
  url: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  project_id: string;
  url: string;
  default_branch?: string;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['project_repositories']['Insert']>; Relationships: [] };
 projects: { Row: {
  id: string;
  organization_id: string;
  name: string;
  goal: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  name: string;
  goal?: string;
  status?: string;
  created_by: string;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['projects']['Insert']>; Relationships: [] };
 task_artifacts: { Row: {
  id: string;
  organization_id: string;
  task_id: string;
  run_id: string;
  name: string;
  storage_path: string;
  sha256: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  task_id: string;
  run_id: string;
  name: string;
  storage_path: string;
  sha256: string;
  mime_type: string;
  size_bytes: number;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['task_artifacts']['Insert']>; Relationships: [] };
 task_comments: { Row: {
  id: string;
  organization_id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['task_comments']['Insert']>; Relationships: [] };
 task_dependencies: { Row: {
  id: string;
  organization_id: string;
  project_id: string;
  task_id: string;
  depends_on_id: string;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  project_id: string;
  task_id: string;
  depends_on_id: string;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['task_dependencies']['Insert']>; Relationships: [] };
 tasks: { Row: {
  id: string;
  organization_id: string;
  project_id: string;
  title: string;
  description: string;
  acceptance_criteria: string;
  assigned_agent_id: string | null;
  auto_start: boolean;
  status: string;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  organization_id: string;
  project_id: string;
  title: string;
  description?: string;
  acceptance_criteria?: string;
  assigned_agent_id?: string | null;
  auto_start?: boolean;
  status?: string;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['tasks']['Insert']>; Relationships: [] };
 user_settings: { Row: {
  id: string;
  user_id: string;
  settings: Json;
  created_at: string;
  updated_at: string;
 }; Insert: {
  id?: string;
  user_id: string;
  settings?: Json;
  created_at?: string;
  updated_at?: string;
 }; Update: Partial<Database['public']['Tables']['user_settings']['Insert']>; Relationships: [] };
}; Views: Record<string, never>; Functions: {
 office_apply_plan: { Args: { p_run: string; p_call: string; p_nodes: Json }; Returns: Json };
 office_control_run: { Args: { p_run: string; p_action: string }; Returns: undefined };
 office_create_organization: { Args: { p_name: string }; Returns: string };
 office_create_project: { Args: { p_org: string; p_name: string; p_goal: string; p_budget: number }; Returns: string };
 office_dashboard_stats: { Args: { p_org: string }; Returns: Json };
 office_decide_approval: { Args: { p_id: string; p_approved: boolean }; Returns: string };
 office_dispatch_project: { Args: { p_project: string; p_actor: string }; Returns: number };
 office_enqueue_task: { Args: { p_task: string; p_key: string }; Returns: string };
 office_finish_run: { Args: { p_run: string; p_status: string; p_error: string }; Returns: boolean };
 office_record_response: { Args: { p_run: string; p_key: string; p_reserved: number; p_cost: number; p_input: number; p_output: number; p_model: string; p_pricing: Json; p_checkpoint: Json; p_iteration: number }; Returns: undefined };
 office_reserve: { Args: { p_run: string; p_amount: number }; Returns: boolean };
 office_role: { Args: { p_org: string }; Returns: string };
 office_settle: { Args: { p_run: string; p_key: string; p_reserved: number; p_cost: number; p_input: number; p_output: number; p_model: string; p_pricing: Json }; Returns: undefined };
}; Enums: Record<string, never>; CompositeTypes: Record<string, never> } };
export type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
