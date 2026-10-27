-- Non-production sample tenant and course catalogue.
-- User accounts and enrollments are deliberately not seeded: create them
-- through Supabase Auth and an administrator-controlled import workflow.

insert into public.universities (name, slug, timezone)
values ('Nigerian Army University Biu', 'naub', 'Africa/Lagos')
on conflict (slug) do nothing;

insert into public.courses (university_id, course_code, title, department, semester)
select u.id, sample.course_code, sample.title, 'Computer Science', '2025/2026 First Semester'
from public.universities u
cross join (values
  ('CSC 301', 'Data Structures and Algorithms'),
  ('CSC 305', 'Database Management Systems'),
  ('CSC 311', 'Operating Systems'),
  ('GST 201', 'Entrepreneurship Studies')
) as sample(course_code, title)
where u.slug = 'naub'
on conflict (university_id, course_code, semester) do nothing;
