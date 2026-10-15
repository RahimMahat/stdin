import type { Profile } from '../commands/types'

// `years` is computed from the roles in site.ts, and `{years}` in the bio with it.
export const profile: Omit<Profile, 'years'> = {
  name: 'Rahim Mahat',
  handle: 'rahim',
  role: 'Senior Data Engineer',
  location: 'Pune, India',
  availability: 'remote worldwide',
  timezone: 'Asia/Kolkata',
  stack: ['Python + PySpark', 'AWS Glue + Jenkins', 'Redshift + Terraform'],
  bio: "I build the pipelines other people's dashboards quietly depend on. {Years} years of it, all at Infocepts — Glue and PySpark on AWS, Terraform underneath, and enough production incidents to have opinions about error handling. Given the choice I take the unglamorous work: the job that runs at 3am and nobody thinks about, because that is the one that has to be right. Lately I have been pointing the same instincts at applied AI, where the interesting problem is still data movement — just with a more expensive consumer at the end of the pipe.",
  email: 'rahimmahat07@gmail.com',
  github: 'https://github.com/RahimMahat',
  linkedin: 'https://linkedin.com/in/rahim-mahat-b53746203',
}
