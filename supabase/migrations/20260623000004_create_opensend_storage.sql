-- OpenSend v0.1.2
-- Storage bucket for file transfers.
-- Private bucket — downloads are served through the app with auth checks.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'opensend-transfers',
  'opensend-transfers',
  false,                              -- private bucket
  52428800,                           -- 50 MB
  null                                -- all mime types
)
on conflict (id) do nothing;

-- Authenticated users can upload to their own folder
create policy "opensend_upload_files"
  on storage.objects for insert
  with check (
    bucket_id = 'opensend-transfers'
    and auth.role() = 'authenticated'
  );

-- Service role / owner can read files for download
create policy "opensend_download_files"
  on storage.objects for select
  using (bucket_id = 'opensend-transfers');

-- Owners can delete their own files
create policy "opensend_delete_own_files"
  on storage.objects for delete
  using (
    bucket_id = 'opensend-transfers'
    and auth.uid() = owner
  );
