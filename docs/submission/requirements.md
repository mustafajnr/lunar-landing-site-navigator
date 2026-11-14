# NASA Space Apps 2026: project submission requirements

Date of check: 2026-11-14.

This file records the official submission rules. Each rule has a source URL. A rule that this check could not confirm is in the section "Not confirmed".

Method: the site renders on the client. The page text came from the Next.js payload (`self.__next_f.push` script tags), fetched with `curl`. The site does not send its intermediate TLS certificate, so `curl` ran without certificate checks. The requests were read-only. The GraphQL API (`https://api.spaceappschallenge.org/graphql`) does not allow schema queries ("introspection is not allowed"), so it gave no data.

## Sources

| Short name | URL | Page date |
|---|---|---|
| Submission guide | https://www.spaceappschallenge.org/resources/project-submission-guide/ | not shown |
| Judging guide | https://www.spaceappschallenge.org/resources/judging-awards-guide/ | November 13, 2026 |
| FAQ | https://www.spaceappschallenge.org/resources/participant-faqs/ | November 13, 2026 |
| Terms | https://www.spaceappschallenge.org/legal/ | "Updated August 7, 2026" |
| Challenge | https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/ | last published 2026-11-13 |

## 1. Deadline

- Submission opens on Saturday, November 14, at 9:00 a.m. It closes on Sunday, November 15, at 11:59 p.m. The time zone is the time zone of the team's Local Event. (Submission guide)
- For the Universal Event, the time zone is the local time of the Team Owner's area of residence. (Submission guide)
- The team must click "Submit for Judging" before the deadline. A project that is saved or submitted after the deadline is not eligible for judging. (Submission guide)
- The team can edit and submit again until the end of the hackathon. The judges review only the last saved submission. (Submission guide)

## 2. Team rules

- A Local Event team must have at least 1 person. A Universal Event team must have at least 2 people to be eligible for global judging. (Judging guide, FAQ)
- A team can have 6 members or fewer. All members must be registered for the same Local Event (not waitlisted) or for the Universal Event. (Judging guide, FAQ)
- A person can be on one team only. A team can work on one challenge only. (FAQ)

Effect for this project: one developer works alone. A team of one is eligible for global judging only through a Local Event. A team of one in the Universal Event is not eligible for global judging.

## 3. Project page fields

The judges review the team's Project page. The Project tab is on the team page. It shows from November 14, 9:00 a.m. local time. (Submission guide)

| Field | What the guide asks |
|---|---|
| Project Name | The name of the project. |
| High-Level Project Summary | What you developed, how it addresses the challenge, and why it is important. |
| Link to Project Demo | A public link to the demo (section 4). No password, permission or registration. |
| Link to Final Project | A public link to the final project, for example a website or a code repository. No password, permission or registration. |
| Detailed Project Description | What it does, how it works, its benefits, what you hope to achieve, and the tools, coding languages, hardware or software that you used. |
| Use of Super Intelligence (SI) | If you used SI tools, how you used them (section 6). |
| NASA Data | The NASA data and resources that you used. To be eligible for a Global Award, the project must use at least one NASA data or resource. |
| Space Agency Partner Data and Other References | All data, resources and tools that you used, including code, text and images, also open-source ones. Permission is necessary for copyrighted material. |

Other rules for the page (Submission guide):

- All required fields must be complete. If not, the "Submit for Judging" button does not work.
- All content must be in English.
- The page accepts images (JPG, PNG, GIF, up to 10 MB). It does not accept videos or documents. Put them on an external service and give a public link.
- Test each link in a private browser window.
- For a new website, the guide recommends a FortiGuard Web Filter Classification request. This is not required. It can prevent access problems for the judges.
- The demo and the final project must not include images, video, audio or other likeness of persons under 18 years old.

At submission, the team must check two boxes (Submission guide, Judging guide):

1. "I have read and understand the project submission requirements as contained in the NASA Space Apps Project Submission Guide, and I agree to the Participant Terms and Conditions and Privacy Policy."
2. "I confirm that the submitted project represents my team's original work and that all external resources including code, text and images (even if they are open source or freely available) used in the project are listed in the References field of the project submission form. In creating our solution, my team has not used any copyrighted materials (i.e., music, images, text, etc.) that we don't have permission to use."

## 4. Demo format

- Every team must make a Project Demo. (Submission guide)
- The format is one of these (Submission guide, Judging guide):
  - a video of **30 seconds or less**, or
  - a slide deck of **7 slides or fewer**, including the title and introduction slides.
- A project that exceeds the 30-second or 7-slide limit is **not eligible for Global Judging**. (Submission guide)
- Put the demo on an external host (for example YouTube, Google Drive, GitHub, OneDrive or Dropbox). The link must be public. You cannot upload the video or the slides to the Space Apps site. (Submission guide)
- Language: English. A video can use another spoken language, but then it must have English subtitles. Slides must be in English. (Submission guide)
- The demo counts in the evaluation. Most of the evaluation uses the project submission. A strong demo can increase the Presentation score. (Submission guide)

Suggested video structure (Submission guide, "Tips for Creating a Project Demo"):

| Time | Content |
|---|---|
| 0:00 | Your name and your team's name |
| 0:02 | The challenge, and why you chose it |
| 0:05 | The project title and tagline |
| 0:10 | How it works. Show the tool and the user experience. Tell how NASA open data and Space Agency Partner data made the solution possible. |
| 0:20–0:30 | The future: what the solution can do for people |

A slide deck must show the team name, the names of the team members and the selected challenge. (Submission guide)

## 5. Judging criteria

Judges give a score of 1 to 5 for each criterion, at all levels of judging. (Judging guide)

| Criterion | Summary of the guide text |
|---|---|
| Impact | The size of the problem and of the audience that the project helps |
| Creativity | Originality and innovation |
| Validity | Scientific basis, technical feasibility, completeness, usability |
| Relevance | The project addresses the challenge directly. NASA data is a core part of the solution. |
| Presentation | Clear communication and storytelling. Judges use the demo and the full project for this score. |

Dates (Judging guide): Global Nominees on December 3, 2026. Global Finalists on December 17, 2026. Global Winners on January 26, 2027.

Minimum requirements for global judging (Judging guide): respond to an official challenge and meet the team rules. Complete all required fields and give a demo in the limits. Use English, submit before the deadline, and check the two boxes. NASA also reviews teams for prohibited bilateral activity with China or Chinese-owned entities.

## 6. Use of AI ("Super Intelligence", SI)

The site uses the term "Super Intelligence (SI)" for AI. The FAQ gives the reason: a U.S. Executive Order of September 29, 2026. (FAQ)

- SI tools are permitted. Examples: large language models, conversational assistants, image and video generators, and code generation tools. (FAQ, Submission guide)
- Each project submission must describe how the team used SI tools. (FAQ)
- SI "should not be used to come up with your idea of how to solve the challenge". (Submission guide)
- SI-generated content must not use, contain or change NASA branding or design elements, for example NASA logos, flags or mission identifiers. (Submission guide)
- The team must clearly show where and how it used SI (Submission guide):
  - Images and videos: a visible watermark that shows SI generation.
  - Audio: an acknowledgement in descriptive text and in metadata.
  - Code and data: an acknowledgement in descriptive text and in metadata.
- The judges do not see the answer in the SI field. It is for data collection. The judges see the SI indicators in the project (watermarks, text, metadata). (Submission guide)

## 7. Licence and third-party material

- Original content must be freely available without restriction, or have an open-source licence as the Open Source Initiative defines it. If the team gives no OSI licence, NASA distributes the original content under the Apache 2.0 licence. (Terms)
- Non-NASA material in the solution (for example a dataset or code) must be freely and publicly available, or have an OSI open-source licence. (Terms)
- Do not submit personally identifiable information, proprietary information, or content for which you do not hold the rights. (Terms)

## 8. Challenge resources

The challenge page lists these resources (Challenge):

- NASA: Quickmap (LROC), Moon Trek, and the JPL Horizons System.
- Space Agency Partner: CSA (Canadian Space Agency) "Moon Exploration" portal.

The 2026 Space Agency Partners (Submission guide): Angola National Space Programme Management Office, Bahrain Space Agency, Brazilian Space Agency, CSA, ESA, ISRO, Italian Space Agency, JAXA, KASA, Mohammed Bin Rashid Space Center, National Space Activities Commission of Argentina, NASRDA (Nigeria), Paraguayan Space Agency, Senegalese Space Studies Agency, Spanish Space Agency, Turkish Space Agency and UK Space Agency.

## Not confirmed

- **Field length limits.** The guide gives no character or word limits. The edit form is visible only to a signed-in team member. The public site scripts contain a general text-area component with a default limit of 1,500 characters. This check could not confirm which fields use that component. Keep the High-Level Project Summary short. Check the counter in the form.
- **Required or optional fields.** The guide says that "all required fields" must be complete. It does not say which fields are required.
- **Field order and exact labels in the live form.** The labels above come from the guide, not from the form.
- **Local Event deadline exceptions.** The guide says to ask the Local Lead about local judging times. The local rules of the developer's event are not known.
- **SI watermark for screenshots.** The screenshots in `docs/submission/screenshots/` are browser captures of the tool. They are not SI-generated images. The guide does not say if a screen capture of SI-assisted software needs a watermark.
