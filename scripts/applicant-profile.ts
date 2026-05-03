/**
 * Shared applicant profile — single source of truth for all apply scripts
 */

export const APPLICANT = {
  name: 'Gabriel Alvin Aquino',
  email: 'gabrielalvin.jobs@gmail.com',
  phone: '0951 540 8978',
  title: 'AI Systems Engineer & Automation Developer',
  location: 'Angeles, Central Luzon, Philippines',
  country: 'Philippines',
  experience_years: 8,
  salary_php: '80000-150000',
  salary_usd: '1500-3000',
  portfolio: 'https://neuralyx.ai.dev-environment.site',
  github: 'https://github.com/UserDevAccount1',
  linkedin: 'https://linkedin.com/in/gabrielalvinaquino',
  resume_url: 'https://neuralyx.ai.dev-environment.site/assets/documents/resume.pdf',
  video_intro: 'https://drive.google.com/file/d/1gLq_z3wHdp7FVX8kWUZheR9nozxbVdcR/view?usp=sharing',
  education: 'BS Information Technology, University of the Cordilleras',

  experience_summary: `I have 8+ years building AI automation systems and full-stack applications. Key achievements:
- Engineered NEURALYX, an AI-powered portfolio with 48 integrated services, 7 autonomous agents, and 5 Docker containers
- Automated 95% of content workflows for LIVITI using n8n and OpenAI
- Built a job pipeline processing 90+ listings in 8 seconds
- Tech stack: Vue.js, TypeScript, Python, FastAPI, Docker, Supabase, PostgreSQL, OpenAI API, LangChain, CrewAI, PHP/Laravel`,

  work_authorization: 'Yes, I am authorized to work in the Philippines. No visa sponsorship required.',
  willing_relocate: 'Open to remote work. Based in Philippines.',
  start_date: 'Immediately available / 1 week notice',
  willing_wfh: 'Yes',

  skills: [
    'Vue.js', 'TypeScript', 'Python', 'Node.js', 'React', 'Next.js',
    'Docker', 'PostgreSQL', 'Supabase', 'OpenAI API', 'LangChain',
    'FastAPI', 'n8n', 'Git', 'CI/CD', 'AWS', 'Tailwind CSS',
  ],
}

export const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
export const USER_DATA_DIR = (() => {
  const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Gab\\AppData\\Local'
  return `${localAppData}\\Microsoft\\Edge\\User Data`
})()
export const PROFILE_DIR = 'Profile 7'
export const MCP_URL = process.env.MCP_SERVER_URL || 'http://localhost:8080'
