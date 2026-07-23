/**
 * Domain types mirroring spec/yuque-openapi.yaml component schemas.
 * Fields used by the CLI are typed explicitly; everything else flows through
 * the index signature so --json output always carries the full payload.
 */

export interface ApiEnvelope<T> {
  data: T;
  [key: string]: unknown;
}

export interface V2User {
  id: number;
  type?: string;
  login: string;
  name: string;
  avatar_url?: string;
  books_count?: number;
  public_books_count?: number;
  followers_count?: number;
  following_count?: number;
  public?: number;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface V2Group {
  id: number;
  type?: string;
  login: string;
  name: string;
  avatar_url?: string;
  books_count?: number;
  public_books_count?: number;
  members_count?: number;
  public?: number;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface V2GroupUser {
  id: number;
  group_id?: number;
  user_id?: number;
  role: number;
  created_at?: string;
  updated_at?: string;
  group?: V2Group;
  user?: V2User;
  [key: string]: unknown;
}

export interface V2SearchResult {
  id: number;
  type: string;
  title: string;
  summary?: string;
  url: string;
  info?: string;
  target?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface V2Book {
  id: number;
  type?: string;
  slug: string;
  name: string;
  user_id?: number;
  description?: string | null;
  creator_id?: number;
  public?: number;
  items_count?: number;
  likes_count?: number;
  watches_count?: number;
  content_updated_at?: string;
  created_at?: string;
  updated_at?: string;
  user?: V2User;
  namespace?: string;
  [key: string]: unknown;
}

export interface V2BookDetail extends V2Book {
  toc_yml?: string;
  [key: string]: unknown;
}

export interface V2Doc {
  id: number;
  type?: string;
  slug: string;
  title: string;
  description?: string | null;
  user_id?: number;
  book_id?: number;
  last_editor_id?: number;
  public?: number;
  status?: number;
  likes_count?: number;
  read_count?: number;
  word_count?: number;
  created_at?: string;
  updated_at?: string;
  content_updated_at?: string;
  published_at?: string;
  first_published_at?: string;
  user?: V2User;
  last_editor?: V2User;
  book?: V2Book;
  [key: string]: unknown;
}

export interface V2DocDetail extends V2Doc {
  format?: string;
  body?: string;
  body_draft?: string;
  body_html?: string;
  body_lake?: string;
  creator?: V2User;
  [key: string]: unknown;
}

export interface V2DocVersion {
  id: number;
  doc_id: number;
  slug?: string;
  title: string;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
  user?: V2User;
  [key: string]: unknown;
}

export interface V2DocVersionDetail extends V2DocVersion {
  format?: string;
  body?: string;
  body_html?: string;
  body_md?: string;
  body_asl?: string;
  diff?: string;
  [key: string]: unknown;
}

export interface V2TocItem {
  uuid: string;
  type: string;
  title: string;
  url?: string;
  slug?: string;
  id?: number;
  doc_id?: number;
  level?: number;
  depth?: number;
  open_window?: number;
  visible?: number;
  prev_uuid?: string;
  sibling_uuid?: string;
  child_uuid?: string;
  parent_uuid?: string;
  [key: string]: unknown;
}

export interface V2GroupStatistics {
  bizdate?: string;
  member_count?: number;
  write_count?: number;
  read_count?: number;
  comment_count?: number;
  [key: string]: unknown;
}

export interface V2MemberStatistics {
  bizdate?: string;
  user_id?: number;
  write_count?: number;
  write_doc_count?: number;
  read_count?: number;
  like_count?: number;
  user?: V2User;
  [key: string]: unknown;
}

export interface V2BookStatistics {
  bizdate?: string;
  book_id?: number;
  slug?: string;
  name?: string;
  post_count?: number;
  word_count?: number;
  read_count?: number;
  like_count?: number;
  [key: string]: unknown;
}

export interface V2DocStatistics {
  bizdate?: string;
  book_id?: number;
  doc_id?: number;
  slug?: string;
  title?: string;
  read_count?: number;
  like_count?: number;
  comment_count?: number;
  word_count?: number;
  [key: string]: unknown;
}
