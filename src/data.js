/*
 * Seed database for the frontend prototype.
 *
 * Everything the proposal calls "database-driven configuration" (domains, job roles,
 * skills, question templates, evaluation criteria and scoring rules) lives in
 * `config` and is editable from the Admin panel. When the FastAPI + PostgreSQL
 * backend is ready, these become the Domain / JobRole / Skill / QuestionTemplate /
 * EvaluationCriteria tables and this file is replaced by API calls.
 */

export const DB_VERSION = 5;

/* ---------------- Configuration ---------------- */

const domains = [
  { id: "tech", name: "Technology" },
  { id: "business", name: "Business" },
  { id: "marketing", name: "Marketing" },
  { id: "hrfin", name: "HR & Finance" },
];

const skills = [
  { name: "React", aliases: ["react", "reactjs", "react.js", "react hooks", "redux", "next.js", "nextjs"], related: ["JavaScript", "TypeScript"], tip: "Practise explaining state, props and re-renders with one small app you built." },
  { name: "JavaScript", aliases: ["javascript", "js", "es6", "ecmascript", "vanilla js", "dom manipulation"], related: ["TypeScript", "React"], tip: "Explain scope, async behaviour and the DOM in plain words, each in two sentences." },
  { name: "HTML", aliases: ["html", "html5", "semantic html", "semantic markup"], related: ["CSS", "HTML/CSS"], tip: "Mention semantic tags and accessibility when you describe a page's structure." },
  { name: "CSS", aliases: ["css", "css3", "tailwind", "tailwind css", "bootstrap", "sass", "scss", "flexbox", "css grid", "responsive design"], related: ["HTML", "HTML/CSS"], tip: "Explain responsive layouts step by step: flexible units, flexbox or grid, then breakpoints." },
  { name: "Git", aliases: ["git", "github", "gitlab", "bitbucket", "version control", "pull request", "pull requests"], related: ["Docker"], tip: "Describe your branch, commit, pull request and review flow in that order." },
  { name: "Testing", aliases: ["testing", "unit test", "unit tests", "unit testing", "jest", "pytest", "integration testing", "tdd"], related: ["Manual testing"], tip: "Give one example: what you tested, the input, and the result you expected." },
  { name: "TypeScript", aliases: ["typescript", "ts", "tsx"], related: ["JavaScript", "React"], tip: "Be ready to explain why types catch mistakes earlier, with one real example." },
  { name: "Python", aliases: ["python", "python3", "django", "flask", "fastapi", "pandas", "numpy"], related: ["SQL", "REST APIs"], tip: "Say what you built with Python and what problem it solved, before naming libraries." },
  { name: "SQL", aliases: ["sql", "postgresql", "postgres", "mysql", "sql server", "sqlite", "t-sql", "joins", "database queries"], related: ["Data analysis", "Python"], tip: "Explain a query in words: which tables, how they join, what you group by and why." },
  { name: "REST APIs", aliases: ["rest api", "rest apis", "restful", "restful api", "api integration", "http methods", "web api", "api development", "postman"], related: ["Python", "JavaScript"], tip: "Use one concrete endpoint example and mention methods, status codes and validation." },
  { name: "Problem solving", aliases: ["problem solving", "problem-solving", "analytical thinking", "analytical skills", "troubleshooting", "root cause analysis", "debugging"], related: ["Testing"], tip: "Show your steps: understand the problem, break it down, try a fix, verify the result." },
  { name: "Docker", aliases: ["docker", "containers", "containerization", "docker compose", "dockerfile"], related: ["Git"], tip: "Explain what a container solves in one sentence: the app runs the same everywhere." },
  { name: "Manual testing", aliases: ["manual testing", "functional testing", "regression testing", "exploratory testing", "smoke testing", "uat", "user acceptance testing"], related: ["Test case design", "Testing"], tip: "Describe how you explore a feature: happy path first, then odd inputs and different devices." },
  { name: "Test case design", aliases: ["test case", "test cases", "test case design", "test scenarios", "test plan", "boundary value", "equivalence partitioning", "test coverage"], related: ["Manual testing", "Bug reporting"], tip: "Show that a test case has an id, steps, test data and one clear expected result." },
  { name: "Bug reporting", aliases: ["bug report", "bug reports", "bug reporting", "defect tracking", "defect report", "jira bugs", "bugzilla", "issue tracking"], related: ["Manual testing", "Communication"], tip: "Practise a bug report: title, steps to reproduce, expected and actual result, evidence." },
  { name: "Test automation (Selenium)", aliases: ["selenium", "test automation", "automation testing", "automated testing", "cypress", "playwright", "webdriver", "testng"], related: ["Testing", "Manual testing"], tip: "Explain which tests you would automate first, and why not everything should be automated." },
  { name: "Figma", aliases: ["figma", "figjam", "auto layout", "figma components", "design tokens", "sketch", "adobe xd"], related: ["Visual design", "Wireframing & prototyping"], tip: "Describe one Figma file you built: pages, components, and how you organised them." },
  { name: "User research", aliases: ["user research", "ux research", "user interviews", "usability testing", "usability test", "surveys", "personas", "user personas", "empathy map", "user journey"], related: ["Wireframing & prototyping", "Communication"], tip: "Tell the story: question, method, what you learned, what you changed in the design." },
  { name: "Wireframing & prototyping", aliases: ["wireframe", "wireframes", "wireframing", "prototype", "prototypes", "prototyping", "low-fidelity", "high-fidelity", "user flow", "user flows", "information architecture"], related: ["Figma", "Visual design"], tip: "Explain why you start low-fidelity: cheap to change, focuses feedback on the flow." },
  { name: "Visual design", aliases: ["visual design", "graphic design", "ui design", "typography", "colour theory", "color theory", "layout design", "design system", "branding", "photoshop", "illustrator"], related: ["Figma", "Canva"], tip: "Explain a design choice with a reason: contrast for readability, spacing for grouping." },
  { name: "HTML/CSS", aliases: ["html/css", "html & css", "html and css", "html5/css3", "html css", "front-end basics"], related: ["HTML", "CSS"], tip: "Say how you hand designs over: you can read the HTML and CSS a developer builds from them." },
  { name: "Excel", aliases: ["excel", "ms excel", "microsoft excel", "spreadsheets", "spreadsheet", "vlookup", "xlookup", "pivot table", "pivot tables", "google sheets", "sumifs"], related: ["Data analysis", "Data visualization (Power BI/Tableau)"], tip: "Prepare a pivot-table or lookup example from a real report you made." },
  { name: "Data analysis", aliases: ["data analysis", "data analytics", "data cleaning", "exploratory analysis", "insights", "kpi", "kpis", "trend analysis"], related: ["Excel", "SQL"], tip: "Structure answers as question, data, finding, recommendation." },
  { name: "Data visualization (Power BI/Tableau)", aliases: ["power bi", "powerbi", "tableau", "data visualization", "data visualisation", "dashboard", "dashboards", "looker studio", "google data studio"], related: ["Data analysis", "Power BI", "Excel"], tip: "Explain one dashboard: who used it, which question it answered, which chart you chose and why." },
  { name: "Statistics", aliases: ["statistics", "statistical analysis", "descriptive statistics", "hypothesis testing", "regression", "correlation", "standard deviation", "probability", "a/b testing"], related: ["Data analysis"], tip: "Explain a statistic in plain words, with a business example, not a formula." },
  { name: "Requirements gathering", aliases: ["requirements gathering", "requirement gathering", "requirements analysis", "business requirements", "requirements elicitation", "brd", "user stories", "user story", "acceptance criteria", "use cases"], related: ["Documentation", "Stakeholder management"], tip: "Show a method: ask why, confirm in writing, agree acceptance criteria." },
  { name: "Documentation", aliases: ["documentation", "technical writing", "process documentation", "sop", "sops", "user guides", "process maps", "process mapping", "flowcharts", "confluence"], related: ["Requirements gathering", "Communication"], tip: "Say who reads your documents and how you keep them short, current and easy to find." },
  { name: "Stakeholder management", aliases: ["stakeholder management", "stakeholder engagement", "stakeholder communication", "client management", "managing stakeholders", "stakeholders"], related: ["Communication", "Requirements gathering"], tip: "Give an example of a stakeholder you won over: what they needed and what you did." },
  { name: "Project planning", aliases: ["project planning", "project management", "project schedule", "gantt", "gantt chart", "milestones", "work breakdown", "scope management", "scrum", "agile", "kanban"], related: ["Time management", "Risk management"], tip: "Walk through a plan: goal, tasks, owners, dates, dependencies." },
  { name: "Time management", aliases: ["time management", "prioritisation", "prioritization", "meeting deadlines", "task prioritization", "multitasking", "deadline management"], related: ["Project planning"], tip: "Name your method for prioritising: urgency, impact, then a realistic daily plan." },
  { name: "Teamwork", aliases: ["teamwork", "team player", "collaboration", "collaborative", "cross-functional", "team collaboration", "working in a team"], related: ["Communication", "Leadership"], tip: "Prepare a team story in STAR format: situation, task, your action, the result." },
  { name: "Jira/Trello", aliases: ["jira", "trello", "asana", "clickup", "monday.com", "kanban board", "sprint board"], related: ["Project planning"], tip: "Describe how you used a board: columns, who updated it, how it helped the team." },
  { name: "Risk management", aliases: ["risk management", "risk assessment", "risk register", "risk mitigation", "contingency plan", "issue log"], related: ["Project planning"], tip: "Use the pattern: spot the risk early, rate its impact, name an owner and a fallback." },
  { name: "Negotiation", aliases: ["negotiation", "negotiating", "deal closing", "closing deals", "contract negotiation", "price negotiation", "objection handling"], related: ["Communication", "Customer service"], tip: "Show you prepare: know your limits, understand their needs, aim for a deal both sides keep." },
  { name: "Customer service", aliases: ["customer service", "customer support", "customer success", "client support", "after-sales", "client relations", "customer satisfaction", "csat", "help desk", "call center", "call centre"], related: ["Communication", "CRM"], tip: "Tell a story about a difficult customer: you listened, solved it, and they stayed." },
  { name: "CRM", aliases: ["crm", "salesforce", "hubspot", "zoho crm", "zoho", "pipedrive", "lead management", "sales pipeline", "lead tracking", "freshsales"], related: ["Customer service", "Excel"], tip: "Explain what you record in a CRM and how that helps the next person who contacts the client." },
  { name: "Social media marketing", aliases: ["social media marketing", "social media", "social media management", "instagram", "facebook", "linkedin marketing", "tiktok", "community management", "social media content"], related: ["Content planning", "Marketing analytics"], tip: "Tie every post to a goal: reach, engagement, leads. Mention one result you measured." },
  { name: "Paid ads (Meta/Google)", aliases: ["paid ads", "meta ads", "facebook ads", "instagram ads", "google ads", "adwords", "ppc", "pay per click", "paid social", "paid advertising", "ad campaigns", "ads manager"], related: ["Marketing analytics", "Social media marketing"], tip: "Explain how you pick audience, budget and creative, and which result tells you an ad works." },
  { name: "Marketing analytics", aliases: ["marketing analytics", "google analytics", "ga4", "campaign analytics", "campaign reporting", "conversion rate", "ctr", "roi", "roas", "marketing metrics", "utm"], related: ["Data analysis", "Paid ads (Meta/Google)"], tip: "Name the metric that matches the goal, then say what you would change because of it." },
  { name: "Content planning", aliases: ["content planning", "content calendar", "content calendars", "content strategy", "editorial calendar", "social media calendar", "content schedule"], related: ["Social media marketing", "Content writing"], tip: "Describe your calendar: goals, themes, formats, posting days, and how you review results." },
  { name: "SEO", aliases: ["seo", "search engine optimization", "search engine optimisation", "on-page seo", "off-page seo", "technical seo", "backlinks", "link building", "meta tags", "serp", "google search console", "semrush", "ahrefs"], related: ["Keyword research", "Content writing"], tip: "Explain SEO as three parts: content that answers the search, a healthy site, and trust from links." },
  { name: "Canva", aliases: ["canva", "canva pro", "social media graphics", "graphic templates", "design templates", "adobe express"], related: ["Visual design", "Social media marketing"], tip: "Show you keep a consistent look: brand colours, fonts and reusable templates." },
  { name: "Content writing", aliases: ["content writing", "copywriting", "blog writing", "blog posts", "article writing", "web copy", "content creation", "copywriter", "creative writing", "ghostwriting"], related: ["SEO", "Editing"], tip: "Bring one piece you wrote and explain the reader, the goal and why you opened the way you did." },
  { name: "Keyword research", aliases: ["keyword research", "keyword planner", "keyword analysis", "search volume", "keyword difficulty", "long-tail keywords", "search intent", "keyword mapping"], related: ["SEO", "Marketing analytics"], tip: "Explain how you choose keywords: search volume, difficulty and whether it matches what the reader wants." },
  { name: "Editing", aliases: ["editing", "proofreading", "copy editing", "copyediting", "content editing", "grammarly", "style guide", "fact-checking", "fact checking"], related: ["Content writing"], tip: "Describe your checklist: facts, structure, clarity, grammar, tone." },
  { name: "WordPress", aliases: ["wordpress", "wp", "wordpress cms", "elementor", "woocommerce", "wordpress plugins", "yoast"], related: ["SEO", "Content writing"], tip: "Mention what you did in WordPress: publishing, plugins, media, SEO settings." },
  { name: "Market research", aliases: ["market research", "competitor analysis", "competitive analysis", "customer research", "consumer research", "market analysis", "swot", "survey research", "market trends", "industry research"], related: ["Data analysis", "Campaign planning"], tip: "Explain the question you wanted answered, the sources you used and what decision came from it." },
  { name: "Campaign planning", aliases: ["campaign planning", "marketing campaign", "marketing campaigns", "campaign management", "campaign strategy", "campaigns", "marketing plan", "marketing strategy", "product launch", "event marketing"], related: ["Market research", "Marketing analytics"], tip: "Walk through a plan: goal, audience, message, channels, budget, timeline, measurement." },
  { name: "Recruitment", aliases: ["recruitment", "talent acquisition", "recruiting", "sourcing", "candidate screening", "screening candidates", "cv screening", "headhunting", "shortlisting", "applicant tracking", "ats", "hiring process", "interview scheduling"], related: ["Onboarding", "Communication"], tip: "Explain a hiring pipeline stage by stage and how you keep candidates informed." },
  { name: "Communication", aliases: ["communication", "communication skills", "verbal communication", "written communication", "presentation", "presentation skills", "public speaking", "email writing", "business communication", "interpersonal skills"], related: ["Teamwork", "Stakeholder management"], tip: "Answer in three parts: headline, one example, the result. Keep sentences short." },
  { name: "Onboarding", aliases: ["onboarding", "employee onboarding", "new hire orientation", "induction", "orientation program", "new joiner", "joining formalities"], related: ["Recruitment", "HR policies & labour law basics"], tip: "Describe what a new employee needs on day one, in the first week and in the first month." },
  { name: "HR policies & labour law basics", aliases: ["hr policies", "hr policy", "labour law", "labor law", "employment law", "employee handbook", "leave policy", "code of conduct", "disciplinary procedure", "eobi", "employment contract", "employment contracts"], related: ["Onboarding", "Conflict resolution"], tip: "Be honest about your level: explain the basics clearly and say you check the current law for details." },
  { name: "HRMS tools", aliases: ["hrms", "hris", "hr software", "hr systems", "bamboohr", "zoho people", "sap successfactors", "workday", "oracle hcm", "employee database", "hr database"], related: ["Payroll processing", "Excel"], tip: "Name the system you used and which task it handled: records, leave, attendance or payroll." },
  { name: "Conflict resolution", aliases: ["conflict resolution", "conflict management", "dispute resolution", "mediation", "mediating", "grievance handling", "employee relations", "de-escalation"], related: ["Communication", "Teamwork"], tip: "Show a calm sequence: listen to both sides, find the real issue, agree on next steps." },
  { name: "Accounting", aliases: ["accounting", "accounts payable", "accounts receivable", "general ledger", "ledger", "journal entries", "trial balance", "financial statements", "balance sheet", "double entry", "ifrs", "gaap", "accrual"], related: ["Bookkeeping & reconciliation", "Financial reporting"], tip: "Explain the accounting equation and one journal entry from a real transaction." },
  { name: "Bookkeeping & reconciliation", aliases: ["bookkeeping", "book keeping", "bank reconciliation", "reconciliation", "reconciling accounts", "cash book", "petty cash", "daily vouchers", "voucher entry", "record keeping"], related: ["Accounting", "Attention to detail"], tip: "Walk through a bank reconciliation: statement, ledger, the difference, and how you cleared it." },
  { name: "Taxation basics (FBR)", aliases: ["fbr", "federal board of revenue", "income tax", "sales tax", "withholding tax", "tax return", "tax returns", "tax filing", "ntn", "iris", "taxation", "tax compliance", "gst"], related: ["Accounting", "Payroll processing"], tip: "State what you have done (filing, withholding, records) and be clear about what you would check with a senior." },
  { name: "QuickBooks/Tally", aliases: ["quickbooks", "tally", "tally erp", "tally prime", "xero", "sage", "zoho books", "accounting software", "peachtree", "odoo accounting"], related: ["Accounting", "Bookkeeping & reconciliation"], tip: "Name the software and the tasks you did in it: invoices, vouchers, reports." },
  { name: "Attention to detail", aliases: ["attention to detail", "detail-oriented", "detail oriented", "accuracy", "data accuracy", "error checking", "quality checks", "meticulous"], related: ["Bookkeeping & reconciliation", "Editing"], tip: "Give a real example of an error you caught, how you caught it and what it would have cost." },
  { name: "Financial analysis", aliases: ["financial analysis", "ratio analysis", "financial ratios", "variance analysis", "financial statement analysis", "profitability analysis", "cash flow analysis", "budget analysis", "cost analysis"], related: ["Financial reporting", "Financial modelling"], tip: "Pick two or three ratios, say what each shows, and give a conclusion a manager can use." },
  { name: "Financial modelling", aliases: ["financial modelling", "financial modeling", "financial forecasting", "forecasting", "forecast", "budgeting", "scenario analysis", "sensitivity analysis", "dcf", "projections"], related: ["Financial analysis", "Excel"], tip: "Explain the assumptions first, then how the numbers change when an assumption changes." },
  { name: "Financial reporting", aliases: ["financial reporting", "management reports", "monthly reports", "mis reports", "mis reporting", "income statement", "profit and loss", "p&l", "cash flow statement", "month-end close", "month end"], related: ["Accounting", "Financial analysis"], tip: "Describe a report you prepared: who read it, how often, and what decision it supported." },
  { name: "Power BI", aliases: ["power bi", "powerbi", "power bi desktop", "power query", "dax", "power bi dashboards"], related: ["Data visualization (Power BI/Tableau)", "Excel"], tip: "Explain one report: data source, how you cleaned it, which visuals you used and what it showed." },
  { name: "Payroll processing", aliases: ["payroll", "payroll processing", "salary processing", "salary sheet", "salary sheets", "payslip", "payslips", "salary calculation", "payroll software", "wages", "salary disbursement"], related: ["Attendance & leave management", "Taxation basics (FBR)"], tip: "Walk through a pay run: attendance, earnings, deductions, tax, approval, payment." },
  { name: "Attendance & leave management", aliases: ["attendance", "attendance management", "leave management", "leave records", "leave balance", "leave tracking", "timesheets", "timesheet", "biometric attendance", "shift scheduling", "overtime"], related: ["Payroll processing", "HRMS tools"], tip: "Explain how you track attendance and leave and how errors are fixed before payroll closes." },
  { name: "Leadership", aliases: ["leadership", "team leadership", "team lead", "team leader", "mentoring", "mentor", "led a team", "supervising", "supervision", "people management"], related: ["Teamwork", "Time management"], tip: "Prepare one story where you took ownership and say what changed because of it." },
];

/* Job roles. `skills` are [name, weight] pairs: 3 = core, 2 = important, 1 = nice to have.
   `responsibilities` are short lines shown to candidates and used to pre-fill a job description. */
const roles = [
  { id: "frontend", title: "Frontend Developer", domainId: "tech", skills: [["React", 3], ["JavaScript", 3], ["HTML", 2], ["CSS", 2], ["Git", 2], ["Testing", 1], ["TypeScript", 1]],
    responsibilities: ["Build responsive UI", "Connect REST APIs", "Fix UI bugs", "Work with designers"] },
  { id: "backend", title: "Backend Developer", domainId: "tech", skills: [["Python", 3], ["SQL", 3], ["REST APIs", 3], ["Git", 2], ["Problem solving", 2], ["Testing", 1], ["Docker", 1]],
    responsibilities: ["Build APIs", "Design database tables", "Write tests", "Debug issues"] },
  { id: "qa", title: "Software QA Engineer", domainId: "tech", skills: [["Manual testing", 3], ["Test case design", 3], ["Bug reporting", 2], ["SQL", 2], ["Test automation (Selenium)", 1], ["Communication", 1]],
    responsibilities: ["Test features", "Write test cases", "Report and track bugs", "Regression testing"] },
  { id: "uiux", title: "UI/UX Designer", domainId: "tech", skills: [["Figma", 3], ["User research", 3], ["Wireframing & prototyping", 2], ["Visual design", 2], ["HTML/CSS", 1], ["Communication", 1]],
    responsibilities: ["Run user research", "Design flows and screens", "Build prototypes", "Hand off to developers"] },
  { id: "data-analyst", title: "Data Analyst", domainId: "tech", skills: [["SQL", 3], ["Excel", 3], ["Data analysis", 3], ["Data visualization (Power BI/Tableau)", 2], ["Python", 2], ["Statistics", 1], ["Communication", 1]],
    responsibilities: ["Clean data", "Build reports and dashboards", "Find trends", "Explain findings"] },
  { id: "analyst", title: "Business Analyst", domainId: "business", skills: [["Requirements gathering", 3], ["Data analysis", 3], ["Documentation", 2], ["Excel", 2], ["Communication", 2], ["SQL", 1], ["Stakeholder management", 1]],
    responsibilities: ["Gather requirements", "Write user stories", "Analyse processes", "Support decisions"] },
  { id: "project-coordinator", title: "Project Coordinator", domainId: "business", skills: [["Project planning", 3], ["Communication", 3], ["Time management", 2], ["Teamwork", 2], ["Jira/Trello", 1], ["Risk management", 1]],
    responsibilities: ["Track tasks and deadlines", "Run meetings", "Update stakeholders", "Manage risks"] },
  { id: "sales-cs", title: "Sales / Customer Success Executive", domainId: "business", skills: [["Communication", 3], ["Negotiation", 3], ["Customer service", 2], ["CRM", 2], ["Excel", 1], ["Problem solving", 1]],
    responsibilities: ["Handle leads", "Close deals", "Support clients", "Keep CRM updated"] },
  { id: "digital-marketing", title: "Digital Marketing Executive", domainId: "marketing", skills: [["Social media marketing", 3], ["Paid ads (Meta/Google)", 3], ["Marketing analytics", 2], ["Content planning", 2], ["SEO", 1], ["Canva", 1]],
    responsibilities: ["Run campaigns", "Manage ad budgets", "Track results", "Plan content calendars"] },
  { id: "content-seo", title: "Content Writer / SEO", domainId: "marketing", skills: [["Content writing", 3], ["SEO", 3], ["Keyword research", 2], ["Editing", 2], ["WordPress", 1], ["Marketing analytics", 1]],
    responsibilities: ["Write blogs and web copy", "Optimise for search", "Edit content", "Track rankings"] },
  { id: "marketing", title: "Marketing Associate", domainId: "marketing", skills: [["Market research", 3], ["Campaign planning", 3], ["Communication", 2], ["Data analysis", 2], ["Excel", 1], ["Teamwork", 1]],
    responsibilities: ["Research competitors and customers", "Support campaigns", "Prepare reports"] },
  { id: "hr", title: "HR Associate", domainId: "hrfin", skills: [["Recruitment", 3], ["Communication", 3], ["Onboarding", 2], ["HR policies & labour law basics", 2], ["Excel", 2], ["HRMS tools", 1], ["Conflict resolution", 1]],
    responsibilities: ["Screen CVs", "Schedule interviews", "Onboard staff", "Maintain employee records"] },
  { id: "accounts", title: "Junior Accountant", domainId: "hrfin", skills: [["Accounting", 3], ["Excel", 3], ["Bookkeeping & reconciliation", 2], ["Taxation basics (FBR)", 2], ["QuickBooks/Tally", 1], ["Attention to detail", 1]],
    responsibilities: ["Record transactions", "Reconcile accounts", "Prepare invoices", "Support tax filing"] },
  { id: "financial-analyst", title: "Financial Analyst", domainId: "hrfin", skills: [["Financial analysis", 3], ["Excel", 3], ["Financial modelling", 2], ["Financial reporting", 2], ["Power BI", 1], ["Communication", 1]],
    responsibilities: ["Analyse statements", "Build forecasts", "Prepare reports", "Support budgeting"] },
  { id: "payroll-admin", title: "Payroll / Admin Officer", domainId: "hrfin", skills: [["Payroll processing", 3], ["Excel", 3], ["Attendance & leave management", 2], ["Taxation basics (FBR)", 2], ["HRMS tools", 1], ["Attention to detail", 1]],
    responsibilities: ["Process salaries", "Manage attendance", "Handle deductions", "Keep records"] },
].map((r) => ({ ...r, active: true, skills: r.skills.map(([name, weight]) => ({ name, weight })) }));

/* Question templates. `keywords` are expected key points used for technical accuracy;
   `followUp` is asked when an answer is incomplete. No question asks for code. */
const questions = [
  { id: "react-t1", skill: "React", type: "technical", text: "How do you decide what belongs in a component's state and what is passed down as props?", keywords: ["state", "props", "parent", "child", "re-render", "lift"], followUp: "What happens when two sibling components need the same piece of state?" },
  { id: "javascript-t1", skill: "JavaScript", type: "technical", text: "Why do web pages use asynchronous operations, and how do you keep a page responsive while data loads?", keywords: ["asynchronous", "promise", "callback", "loading", "blocking", "response", "user"], followUp: "How would you show the user that something is still loading?" },
  { id: "html-t1", skill: "HTML", type: "technical", text: "Why does semantic HTML matter, and which elements do you use most when structuring a page?", keywords: ["semantic", "accessibility", "header", "nav", "main", "screen reader"], followUp: "How does semantic HTML help a screen-reader user?" },
  { id: "css-t1", skill: "CSS", type: "technical", text: "How would you make a page layout work well on both a phone and a desktop screen?", keywords: ["flexbox", "grid", "media query", "responsive", "breakpoint", "mobile first"], followUp: "Which breakpoints would you choose, and why?" },
  { id: "git-t1", skill: "Git", type: "technical", text: "Describe your Git workflow when several people work on the same project.", keywords: ["branch", "commit", "pull request", "review", "merge", "conflict"], followUp: "How do you resolve a merge conflict?" },
  { id: "testing-t1", skill: "Testing", type: "technical", text: "How do you decide what to test when you finish a new feature?", keywords: ["unit", "edge case", "input", "expected", "integration", "bug"], followUp: "Give an example of an edge case you would test." },
  { id: "typescript-t1", skill: "TypeScript", type: "technical", text: "What problems do static types help prevent in a large web project?", keywords: ["type", "error", "compile", "refactor", "autocomplete", "interface"], followUp: "What is the cost of adding types to a small project?" },
  { id: "python-t1", skill: "Python", type: "technical", text: "Where have you used Python, and why was it a good fit for that task?", keywords: ["library", "script", "automation", "data", "web", "readable"], followUp: "What would you use instead if the task needed to run much faster?" },
  { id: "sql-t1", skill: "SQL", type: "technical", text: "What is the difference between an inner join and a left join, and when would you use each?", keywords: ["inner", "left", "match", "null", "rows", "table", "key"], followUp: "How would you find customers who have never placed an order?" },
  { id: "rest-apis-t1", skill: "REST APIs", type: "technical", text: "What makes a REST API well designed? Describe an endpoint you would create and what it returns.", keywords: ["resource", "get", "post", "status code", "json", "validation", "authentication"], followUp: "Which status codes would that endpoint return on success and on errors?" },
  { id: "problem-solving-t1", skill: "Problem solving", type: "technical", text: "Walk me through how you would approach a problem you have never seen before.", keywords: ["understand", "break down", "options", "test", "verify", "ask"], followUp: "How do you know when to ask for help?" },
  { id: "docker-t1", skill: "Docker", type: "technical", text: "What problem do containers solve for a development team?", keywords: ["environment", "consistent", "image", "isolation", "deploy", "dependencies"], followUp: "How is a container different from a virtual machine?" },
  { id: "manual-testing-t1", skill: "Manual testing", type: "technical", text: "How would you test a login page by hand? What would you check besides a correct login?", keywords: ["valid", "invalid", "empty", "password", "error message", "lockout", "browser"], followUp: "Which of those checks would you do first if you had only ten minutes?" },
  { id: "test-case-design-t1", skill: "Test case design", type: "technical", text: "What does a good test case contain, and how do you choose which cases to write for a new feature?", keywords: ["steps", "expected result", "test data", "boundary", "negative", "priority", "coverage"], followUp: "How do boundary values help when testing an age field that accepts 18 to 60?" },
  { id: "bug-reporting-t1", skill: "Bug reporting", type: "technical", text: "What information makes a bug report easy for a developer to act on?", keywords: ["steps to reproduce", "expected", "actual", "screenshot", "severity", "environment"], followUp: "How do you decide between severity and priority?" },
  { id: "test-automation-selenium-t1", skill: "Test automation (Selenium)", type: "technical", text: "How do you decide which tests are worth automating and which should stay manual?", keywords: ["repeat", "regression", "stable", "time", "maintenance", "manual", "return"], followUp: "What makes an automated test flaky, and how do you reduce that?" },
  { id: "figma-t1", skill: "Figma", type: "technical", text: "How do you organise a Figma file so that a team can reuse and update it easily?", keywords: ["components", "styles", "auto layout", "naming", "library", "variants"], followUp: "How do you keep designs consistent when several designers work in the same file?" },
  { id: "user-research-t1", skill: "User research", type: "technical", text: "How would you find out why users abandon a sign-up form?", keywords: ["interview", "observe", "analytics", "usability test", "hypothesis", "survey", "findings"], followUp: "How many users would you test with, and how do you handle conflicting feedback?" },
  { id: "wireframing-prototyping-t1", skill: "Wireframing & prototyping", type: "technical", text: "What is the difference between a wireframe and a prototype, and when do you use each?", keywords: ["layout", "low fidelity", "interactive", "flow", "feedback", "testing"], followUp: "How do you decide when a design is ready to hand to developers?" },
  { id: "visual-design-t1", skill: "Visual design", type: "technical", text: "How do you use colour, typography and spacing to guide a user's attention on a screen?", keywords: ["hierarchy", "contrast", "spacing", "typography", "consistency", "accessibility"], followUp: "How do you check that your colours are readable for people with low vision?" },
  { id: "html-css-t1", skill: "HTML/CSS", type: "technical", text: "Why is it useful for a designer to understand basic HTML and CSS?", keywords: ["handoff", "feasible", "responsive", "developer", "constraints", "box model"], followUp: "Give an example of a design idea that is hard to build in CSS." },
  { id: "excel-t1", skill: "Excel", type: "technical", text: "How would you summarise a large sales sheet by region and month in Excel?", keywords: ["pivot", "sumifs", "filter", "region", "month", "chart"], followUp: "How would you keep that summary up to date when new rows are added?" },
  { id: "data-analysis-t1", skill: "Data analysis", type: "technical", text: "Walk me through how you would find out why sales dropped last month.", keywords: ["data", "compare", "segment", "trend", "cause", "recommend"], followUp: "Which chart would you show a manager to explain your finding?" },
  { id: "data-visualization-power-bi-tableau-t1", skill: "Data visualization (Power BI/Tableau)", type: "technical", text: "How do you choose the right chart for a number you want a manager to understand quickly?", keywords: ["audience", "comparison", "trend", "bar", "line", "clutter", "message"], followUp: "What would you remove from a dashboard that feels crowded?" },
  { id: "statistics-t1", skill: "Statistics", type: "technical", text: "What is the difference between correlation and causation? Give an example from business data.", keywords: ["correlation", "causation", "third factor", "experiment", "example", "evidence"], followUp: "How would you test whether a new offer really increased sales?" },
  { id: "requirements-gathering-t1", skill: "Requirements gathering", type: "technical", text: "How would you gather requirements from a stakeholder who only says they want a better report?", keywords: ["ask", "why", "goal", "examples", "acceptance criteria", "confirm", "priority"], followUp: "How do you handle two stakeholders who want conflicting things?" },
  { id: "documentation-t1", skill: "Documentation", type: "technical", text: "What makes a requirements or process document useful for the people who read it?", keywords: ["audience", "clear", "structure", "version", "examples", "up to date"], followUp: "How do you make sure people actually read and use your documents?" },
  { id: "stakeholder-management-t1", skill: "Stakeholder management", type: "technical", text: "How do you keep stakeholders informed and aligned during a project?", keywords: ["updates", "expectations", "regular", "concerns", "agree", "transparent"], followUp: "What would you do if a senior stakeholder keeps changing their mind?" },
  { id: "project-planning-t1", skill: "Project planning", type: "technical", text: "How would you plan a small project from the first day to delivery?", keywords: ["scope", "tasks", "owners", "deadline", "dependencies", "milestones", "review"], followUp: "What do you do when one task finishes late and others depend on it?" },
  { id: "time-management-t1", skill: "Time management", type: "technical", text: "How do you decide what to work on first when everything seems urgent?", keywords: ["priority", "urgent", "important", "deadline", "plan", "communicate"], followUp: "How do you tell your manager that a deadline is at risk?" },
  { id: "teamwork-t1", skill: "Teamwork", type: "technical", text: "What do you think makes a team work well together, and what do you personally contribute?", keywords: ["trust", "roles", "communication", "support", "feedback", "shared goal"], followUp: "What do you do when a teammate is not delivering their part?" },
  { id: "jira-trello-t1", skill: "Jira/Trello", type: "technical", text: "How do you use a task board such as Jira or Trello to keep a team organised?", keywords: ["columns", "status", "assign", "priority", "deadline", "update", "visible"], followUp: "What do you do when people stop updating the board?" },
  { id: "risk-management-t1", skill: "Risk management", type: "technical", text: "How would you identify and handle risks in a project that has a fixed deadline?", keywords: ["identify", "likelihood", "impact", "mitigation", "owner", "monitor", "fallback"], followUp: "Give an example of a risk that is small but still worth tracking." },
  { id: "negotiation-t1", skill: "Negotiation", type: "technical", text: "A customer says your price is too high. How do you respond?", keywords: ["value", "listen", "needs", "options", "compromise", "limit", "long-term"], followUp: "When would you walk away from a deal?" },
  { id: "customer-service-t1", skill: "Customer service", type: "technical", text: "How do you handle a customer who is angry about a problem that was not your fault?", keywords: ["listen", "apologise", "empathy", "solution", "follow up", "calm", "ownership"], followUp: "How do you decide when to escalate a complaint to a manager?" },
  { id: "crm-t1", skill: "CRM", type: "technical", text: "Why does a sales team need a CRM, and what should be recorded after each customer contact?", keywords: ["contact", "notes", "pipeline", "follow-up", "history", "stage", "report"], followUp: "How do you keep the CRM accurate when the team is busy?" },
  { id: "social-media-marketing-t1", skill: "Social media marketing", type: "technical", text: "How would you grow engagement on a brand's Instagram or Facebook page?", keywords: ["audience", "content", "consistency", "engagement", "reels", "analytics", "community"], followUp: "If reach is high but engagement is low, what would you change?" },
  { id: "paid-ads-meta-google-t1", skill: "Paid ads (Meta/Google)", type: "technical", text: "How would you set up a small paid campaign on Meta or Google with a limited budget?", keywords: ["objective", "audience", "budget", "creative", "targeting", "cpc", "conversion", "test"], followUp: "Your cost per click is rising. What do you check first?" },
  { id: "marketing-analytics-t1", skill: "Marketing analytics", type: "technical", text: "Which metrics would you track to tell whether a marketing campaign worked?", keywords: ["goal", "reach", "ctr", "conversion", "cost", "roi", "compare"], followUp: "A campaign has many clicks but few sales. What might explain it?" },
  { id: "content-planning-t1", skill: "Content planning", type: "technical", text: "How would you plan a month of content for a small brand?", keywords: ["goal", "audience", "themes", "calendar", "formats", "schedule", "review"], followUp: "How do you decide which topics to repeat and which to drop?" },
  { id: "seo-t1", skill: "SEO", type: "technical", text: "What would you do to help a new blog post rank for a search term?", keywords: ["keyword", "title", "meta description", "headings", "links", "intent", "quality"], followUp: "How long before you expect to see results, and how do you check progress?" },
  { id: "canva-t1", skill: "Canva", type: "technical", text: "How do you keep social posts looking consistent when you design them quickly?", keywords: ["brand", "colours", "fonts", "templates", "layout", "logo", "consistent"], followUp: "How do you pick an image that fits the message of a post?" },
  { id: "content-writing-t1", skill: "Content writing", type: "technical", text: "How do you start writing a blog post for a topic you do not know well?", keywords: ["research", "audience", "outline", "sources", "tone", "headline", "edit"], followUp: "How do you make a dry topic interesting?" },
  { id: "keyword-research-t1", skill: "Keyword research", type: "technical", text: "How do you find and choose keywords for a new page?", keywords: ["search volume", "difficulty", "intent", "long-tail", "competitors", "relevance", "tools"], followUp: "Would you choose a high-volume keyword or a low-volume one for a new site, and why?" },
  { id: "editing-t1", skill: "Editing", type: "technical", text: "What do you check when you edit someone else's article before it is published?", keywords: ["facts", "structure", "clarity", "grammar", "tone", "consistency", "feedback"], followUp: "How do you give an editing note to a writer who is defensive about their work?" },
  { id: "wordpress-t1", skill: "WordPress", type: "technical", text: "What do you do in a WordPress site to publish a post that is ready for search engines?", keywords: ["title", "permalink", "categories", "images", "alt text", "plugin", "preview"], followUp: "What can go wrong when you install too many plugins?" },
  { id: "market-research-t1", skill: "Market research", type: "technical", text: "How would you research a competitor before your company launches a similar product?", keywords: ["competitor", "pricing", "customers", "strengths", "weaknesses", "sources", "summary"], followUp: "How do you check that the information you found is reliable?" },
  { id: "campaign-planning-t1", skill: "Campaign planning", type: "technical", text: "How would you plan a campaign to launch a new product on a small budget?", keywords: ["goal", "audience", "message", "channels", "budget", "timeline", "measure"], followUp: "How do you decide which channel gets the most budget?" },
  { id: "recruitment-t1", skill: "Recruitment", type: "technical", text: "How would you design a fair screening process for an entry-level role?", keywords: ["criteria", "structured", "bias", "shortlist", "interview", "consistent"], followUp: "How would you check that the process was fair after a hiring round?" },
  { id: "communication-t1", skill: "Communication", type: "technical", text: "How would you explain a complicated topic from your field to someone with no background in it?", keywords: ["audience", "simple", "example", "check understanding", "structure", "avoid jargon"], followUp: "How do you know the other person really understood you?" },
  { id: "onboarding-t1", skill: "Onboarding", type: "technical", text: "What would you include in an onboarding plan for a new employee's first week?", keywords: ["welcome", "documents", "equipment", "introductions", "training", "buddy", "feedback"], followUp: "How do you find out if the onboarding worked?" },
  { id: "hr-policies-labour-law-basics-t1", skill: "HR policies & labour law basics", type: "technical", text: "Why does a company need written HR policies, and how do you make sure staff follow them?", keywords: ["written", "fair", "consistent", "communicate", "acknowledge", "legal", "review"], followUp: "What do you do when a manager asks you to make an exception to a policy?" },
  { id: "hrms-tools-t1", skill: "HRMS tools", type: "technical", text: "What are the benefits of keeping employee records in an HR system instead of spreadsheets?", keywords: ["accuracy", "central", "access", "reports", "security", "audit", "time"], followUp: "How do you protect employee data in such a system?" },
  { id: "conflict-resolution-t1", skill: "Conflict resolution", type: "technical", text: "Two employees on your team are in a dispute. How would you help resolve it?", keywords: ["listen", "both sides", "facts", "neutral", "agreement", "follow up", "confidential"], followUp: "When would you involve a manager or HR head?" },
  { id: "accounting-t1", skill: "Accounting", type: "technical", text: "What is the difference between a debit and a credit, and how do they affect assets and expenses?", keywords: ["debit", "credit", "assets", "liabilities", "double entry", "balance", "ledger"], followUp: "How do you check that a trial balance balances?" },
  { id: "bookkeeping-reconciliation-t1", skill: "Bookkeeping & reconciliation", type: "technical", text: "How would you approach a bank reconciliation that does not balance?", keywords: ["statement", "ledger", "difference", "timing", "error", "adjust"], followUp: "What are common causes of timing differences?" },
  { id: "taxation-basics-fbr-t1", skill: "Taxation basics (FBR)", type: "technical", text: "What do you need to prepare before filing a company's tax return with the FBR?", keywords: ["records", "income", "expenses", "withholding", "deadline", "documents", "ntn", "accuracy"], followUp: "What risks does a company face if it files late or incorrectly?" },
  { id: "quickbooks-tally-t1", skill: "QuickBooks/Tally", type: "technical", text: "What are the advantages of using accounting software instead of recording everything by hand?", keywords: ["accuracy", "reports", "automation", "audit trail", "time", "invoices", "errors"], followUp: "What checks do you still do yourself after entering data in the software?" },
  { id: "attention-to-detail-t1", skill: "Attention to detail", type: "technical", text: "What habits do you use to avoid mistakes when you work with numbers or records?", keywords: ["double-check", "checklist", "review", "verify", "totals", "compare", "slow down"], followUp: "Tell me about a mistake that got through and what you changed afterwards." },
  { id: "financial-analysis-t1", skill: "Financial analysis", type: "technical", text: "How would you judge from financial statements whether a company is in good health?", keywords: ["profit", "liquidity", "debt", "cash flow", "ratio", "trend", "compare"], followUp: "Which one number would you look at first, and why?" },
  { id: "financial-modelling-t1", skill: "Financial modelling", type: "technical", text: "How do you build a simple forecast for next year's revenue and costs?", keywords: ["assumptions", "historical", "growth", "costs", "scenarios", "review", "inputs"], followUp: "How do you decide which assumption to test first?" },
  { id: "financial-reporting-t1", skill: "Financial reporting", type: "technical", text: "What goes into a monthly financial report for management, and how do you make it easy to read?", keywords: ["income", "expenses", "profit", "balance", "variance", "summary", "deadline"], followUp: "How do you explain an unexpected variance to a manager?" },
  { id: "power-bi-t1", skill: "Power BI", type: "technical", text: "How would you use Power BI to show a manager monthly revenue by region?", keywords: ["data source", "clean", "measure", "visual", "filter", "region", "refresh"], followUp: "How do you keep a report accurate when the data changes every day?" },
  { id: "payroll-processing-t1", skill: "Payroll processing", type: "technical", text: "What steps would you follow to process monthly salaries accurately?", keywords: ["attendance", "gross", "deductions", "tax", "approval", "payslip", "verify"], followUp: "What would you do if you find a salary error after payment?" },
  { id: "attendance-leave-management-t1", skill: "Attendance & leave management", type: "technical", text: "How would you keep attendance and leave records accurate for a team of 100 people?", keywords: ["records", "approval", "policy", "balance", "verify", "report", "deadline"], followUp: "How do you deal with a dispute about a missing attendance entry?" },
  { id: "leadership-t1", skill: "Leadership", type: "technical", text: "What do you think a good leader does differently from a good individual worker?", keywords: ["direction", "delegate", "support", "feedback", "example", "responsibility"], followUp: "How do you lead someone who is more experienced than you?" },
  { id: "b-communication-1", skill: "Communication", type: "behavioral", text: "Tell me about yourself and the strengths you would bring to this role.", keywords: ["experience", "project", "skill", "team", "learned"], followUp: "Which one of those strengths has made the biggest difference in a project, and how?" },
  { id: "b-communication-2", skill: "Communication", type: "behavioral", text: "Describe a time you had to explain something difficult to someone who did not understand it. What did you do?", keywords: ["situation", "simple", "example", "checked", "result"], followUp: "What would you do differently next time?" },
  { id: "b-teamwork-1", skill: "Teamwork", type: "behavioral", text: "Tell me about a time you disagreed with a teammate. How did you resolve it?", keywords: ["listened", "agreed", "compromise", "discussed", "outcome"], followUp: "Looking back, what would you do differently in that disagreement?" },
  { id: "b-teamwork-2", skill: "Teamwork", type: "behavioral", text: "Describe a team project where you had to depend on others. What was your part and how did it go?", keywords: ["role", "shared", "deadline", "supported", "result"], followUp: "How did you handle a teammate who was behind schedule?" },
  { id: "b-problem-solving-1", skill: "Problem solving", type: "behavioral", text: "Describe a difficult problem you solved. What was the situation and what did you do?", keywords: ["problem", "steps", "tested", "result", "cause"], followUp: "How did you confirm that your solution actually fixed the problem?" },
  { id: "b-problem-solving-2", skill: "Problem solving", type: "behavioral", text: "Tell me about a time something went wrong at work or university and you had to find a fix quickly.", keywords: ["situation", "options", "decision", "action", "result"], followUp: "What did you learn that helps you today?" },
  { id: "b-time-management-1", skill: "Time management", type: "behavioral", text: "Tell me about a time you had several deadlines at once. How did you manage them?", keywords: ["priority", "plan", "deadline", "communicated", "result"], followUp: "Was there anything you had to let go of, and how did you decide?" },
  { id: "b-time-management-2", skill: "Time management", type: "behavioral", text: "Describe a time you were running late on a task. What did you do?", keywords: ["noticed", "told", "adjusted", "help", "delivered"], followUp: "How do you stop the same delay from happening again?" },
  { id: "b-leadership-1", skill: "Leadership", type: "behavioral", text: "Tell me about a time you took the lead on something without being asked.", keywords: ["initiative", "team", "plan", "result", "responsibility"], followUp: "How did the rest of the team respond to you taking the lead?" },
  { id: "b-leadership-2", skill: "Leadership", type: "behavioral", text: "Describe a time you helped a colleague improve or learn something new.", keywords: ["situation", "supported", "feedback", "patience", "result"], followUp: "How did you know your help worked?" },
];

/* Evaluation criteria from the proposal. `appliesTo`: all | technical | behavioral */
const criteria = [
  { key: "technical", label: "Technical accuracy", weight: 2, appliesTo: "technical", enabled: true },
  { key: "relevance", label: "Relevance", weight: 2, appliesTo: "all", enabled: true },
  { key: "completeness", label: "Completeness", weight: 2, appliesTo: "all", enabled: true },
  { key: "clarity", label: "Clarity", weight: 1, appliesTo: "all", enabled: true },
  { key: "communication", label: "Communication", weight: 1, appliesTo: "all", enabled: true },
  { key: "star", label: "STAR structure", weight: 2, appliesTo: "behavioral", enabled: true },
];

const rules = {
  weakThreshold: 60, // a skill below this…
  weakMinSessions: 2, // …across at least this many sessions becomes a persistent weakness
  followUpBelow: 55, // completeness below this triggers a follow-up question
  defaultQuestions: 5,
  faceThreshold: 0.55, // minimum face-template similarity (0–1) to accept a sign-in
};

/* ---------------- Demo users & data ---------------- */

const DAY = 86400000;
const now = Date.now();

const users = [
  { id: "adm-1", role: "admin", name: "Intervo Admin", email: "admin@intervo.demo", passwordHash: "1ea93fe2f4b5daced96693ae56a56c09618e03169c6365ee412b98583611570e", createdAt: now - 60 * DAY },
  { id: "nsx-1", role: "employer", name: "Hira Malik", company: "Northstar Digital", email: "hr@northstar.demo", passwordHash: "178d93c684c15893cd48dd83e32bc28bddf4d0c8db7e4d5b535f4b3d4fa60875", createdAt: now - 40 * DAY },
  { id: "cand-1", role: "candidate", name: "Ayesha Khan", email: "ayesha@intervo.demo", passwordHash: "c798071dd627e99cc3e68b6c08db521e70ab87ef6d1fee78e3849e0be18ef29c", createdAt: now - 30 * DAY },
  { id: "cand-2", role: "candidate", name: "Bilal Ahmed", email: "bilal@intervo.demo", passwordHash: "265ffee4e9c4aaf60608d0f4f9706f1a921a086201d17cf91068545ad79c531e", createdAt: now - 25 * DAY },
  { id: "cand-3", role: "candidate", name: "Sana Iqbal", email: "sana@intervo.demo", passwordHash: "359b58d58acfd8e93955d0580364cb675d5e9085f09092922a236bb22565745a", createdAt: now - 20 * DAY },
];

const profiles = {
  "cand-1": { skills: ["React", "JavaScript", "HTML", "CSS", "Git", "Communication"], roleId: "frontend", shareWithEmployers: true, fileName: "Ayesha_Khan_CV.pdf" },
  "cand-2": { skills: ["JavaScript", "HTML", "CSS", "Teamwork", "Figma"], roleId: "frontend", shareWithEmployers: true, fileName: "Bilal_Ahmed_CV.pdf" },
  "cand-3": { skills: ["React", "TypeScript", "CSS", "HTML", "Git", "Testing", "Communication"], roleId: "frontend", shareWithEmployers: true, fileName: "Sana_Iqbal_CV.pdf" },
};

function demoSession(userId, roleId, daysAgo, scores) {
  const answers = scores.map(([skill, score]) => {
    const q = questions.find((x) => x.skill === skill) || questions[0];
    const c = (d) => Math.max(20, Math.min(98, score + d));
    return {
      questionId: q.id, question: q.text, skill, type: q.type, score,
      criteria: q.type === "technical"
        ? { technical: c(-2), relevance: c(4), completeness: c(-4), clarity: c(3), communication: c(1) }
        : { relevance: c(4), completeness: c(-4), clarity: c(3), communication: c(1), star: c(-3) },
      answer: "",
    };
  });
  const score = Math.round(answers.reduce((s, a) => s + a.score, 0) / answers.length);
  return { id: `s-${userId}-${daysAgo}`, userId, roleId, roleTitle: roles.find((r) => r.id === roleId).title, mode: "text", date: now - daysAgo * DAY, score, answers };
}

const sessions = [
  demoSession("cand-1", "frontend", 12, [["React", 64], ["JavaScript", 70], ["CSS", 58], ["Communication", 66]]),
  demoSession("cand-1", "frontend", 5, [["React", 76], ["CSS", 62], ["Testing", 48], ["Communication", 74]]),
  demoSession("cand-1", "frontend", 1, [["React", 82], ["JavaScript", 79], ["Testing", 55], ["Git", 72]]),
  demoSession("cand-2", "frontend", 8, [["JavaScript", 55], ["CSS", 70], ["Teamwork", 78], ["React", 46]]),
  demoSession("cand-2", "frontend", 2, [["React", 52], ["JavaScript", 60], ["Communication", 69]]),
  demoSession("cand-3", "frontend", 6, [["React", 84], ["Testing", 78], ["CSS", 80], ["Communication", 71]]),
];

const jobs = [
  {
    id: "job-1", employerId: "nsx-1", company: "Northstar Digital", title: "Junior Frontend Developer", roleId: "frontend",
    location: "Lahore", mode: "Remote", level: "Entry level", type: "Full-time", status: "open", createdAt: now - 9 * DAY,
    description: "Build accessible, responsive interfaces alongside a small product team shipping weekly.",
    skills: [{ name: "React", weight: 3 }, { name: "JavaScript", weight: 3 }, { name: "CSS", weight: 2 }, { name: "Git", weight: 1 }, { name: "Testing", weight: 1 }],
    success: { minMatch: 60, notes: "Comfortable explaining component design and responsive layouts." },
  },
  {
    id: "job-2", employerId: "nsx-1", company: "Northstar Digital", title: "Web Developer Intern", roleId: "frontend",
    location: "Lahore", mode: "Hybrid", level: "Internship", type: "Internship", status: "open", createdAt: now - 4 * DAY,
    description: "Pair with senior developers on client websites and learn a production review workflow.",
    skills: [{ name: "HTML", weight: 2 }, { name: "CSS", weight: 2 }, { name: "JavaScript", weight: 2 }, { name: "Git", weight: 1 }],
    success: { minMatch: 50, notes: "Eagerness to learn and clear communication." },
  },
  {
    id: "job-3", employerId: null, company: "Vertex Systems", title: "Junior Software Engineer", roleId: "backend",
    location: "Karachi", mode: "On-site", level: "Entry level", type: "Full-time", status: "open", createdAt: now - 7 * DAY,
    description: "Contribute to features, tests and maintenance for internal business applications.",
    skills: [{ name: "Python", weight: 3 }, { name: "SQL", weight: 3 }, { name: "REST APIs", weight: 2 }, { name: "Problem solving", weight: 2 }],
    success: { minMatch: 60, notes: "" },
  },
  {
    id: "job-4", employerId: null, company: "Crescent Analytics", title: "Associate Business Analyst", roleId: "analyst",
    location: "Lahore", mode: "Hybrid", level: "Entry level", type: "Full-time", status: "open", createdAt: now - 3 * DAY,
    description: "Turn stakeholder questions into clear reports and help teams make data-backed decisions.",
    skills: [{ name: "Data analysis", weight: 3 }, { name: "Excel", weight: 3 }, { name: "SQL", weight: 2 }, { name: "Communication", weight: 2 }],
    success: { minMatch: 60, notes: "" },
  },
  {
    id: "job-5", employerId: null, company: "Indus Media Co.", title: "Marketing Trainee", roleId: "marketing",
    location: "Gujrat", mode: "On-site", level: "Internship", type: "Internship", status: "open", createdAt: now - 1 * DAY,
    description: "Support campaign planning, social content and performance tracking for regional brands.",
    skills: [{ name: "Campaign planning", weight: 3 }, { name: "Market research", weight: 2 }, { name: "Communication", weight: 2 }, { name: "Teamwork", weight: 1 }],
    success: { minMatch: 50, notes: "" },
  },
];

const applications = [
  { id: "app-1", jobId: "job-1", candidateId: "cand-1", date: now - 2 * DAY, consent: true },
  { id: "app-2", jobId: "job-1", candidateId: "cand-2", date: now - 3 * DAY, consent: true },
  { id: "app-3", jobId: "job-1", candidateId: "cand-3", date: now - 1 * DAY, consent: true },
  { id: "app-4", jobId: "job-2", candidateId: "cand-2", date: now - 1 * DAY, consent: true },
];

export function seedDB() {
  return structuredClone({
    version: DB_VERSION,
    config: { domains, skills, roles, questions, criteria, rules },
    users,
    profiles,
    sessions,
    jobs,
    applications,
  });
}

export const DEMO_ACCOUNTS = [
  { role: "candidate", email: "ayesha@intervo.demo", password: "Demo@1234" },
  { role: "employer", email: "hr@northstar.demo", password: "Demo@1234" },
  { role: "admin", email: "admin@intervo.demo", password: "Admin@1234" },
];
