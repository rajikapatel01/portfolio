const extractBtn = document.getElementById('extractBtn');
const spinner = document.getElementById('spinner');
const status = document.getElementById('status');
const results = document.getElementById('results');
const dataPreview = document.getElementById('dataPreview');
const copyBtn = document.getElementById('copyBtn');
const toast = document.getElementById('toast');

let extractedData = '';

extractBtn.addEventListener('click', async () => {
  // Get the current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url || !tab.url.includes('linkedin.com/in/')) {
    status.className = 'status error';
    status.textContent = 'Please navigate to a LinkedIn profile page first (linkedin.com/in/...)';
    return;
  }

  // Show loading state
  extractBtn.disabled = true;
  spinner.style.display = 'block';
  extractBtn.childNodes[extractBtn.childNodes.length - 1].textContent = ' Extracting...';
  status.className = 'status info';
  status.textContent = 'Extracting profile data...';

  try {
    // Inject and execute the extraction script
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractLinkedInProfile
    });

    if (result && result.result) {
      extractedData = result.result;
      dataPreview.textContent = extractedData;
      results.style.display = 'block';
      status.className = 'status success';
      status.textContent = 'Profile extracted! Copy and paste it to Claude.';
    } else {
      status.className = 'status error';
      status.textContent = 'Could not extract data. Make sure the profile page is fully loaded.';
    }
  } catch (err) {
    status.className = 'status error';
    status.textContent = 'Error: ' + err.message;
  }

  // Reset button
  extractBtn.disabled = false;
  spinner.style.display = 'none';
  extractBtn.childNodes[extractBtn.childNodes.length - 1].textContent = ' Extract Profile Data';
});

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(extractedData);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  } catch (err) {
    // Fallback copy
    const textarea = document.createElement('textarea');
    textarea.value = extractedData;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }
});

// The extraction function that runs in the LinkedIn page context
function extractLinkedInProfile() {
  const getText = (selector) => {
    const el = document.querySelector(selector);
    return el ? el.textContent.trim() : '';
  };

  const getAllText = (selector) => {
    return Array.from(document.querySelectorAll(selector))
      .map(el => el.textContent.trim())
      .filter(t => t);
  };

  let output = '=== LINKEDIN PROFILE DATA ===\n\n';

  // ── Name ──
  const name = getText('.text-heading-xlarge') ||
               getText('h1.inline.t-24') ||
               getText('h1');
  output += `NAME: ${name}\n`;

  // ── Headline ──
  const headline = getText('.text-body-medium.break-words') ||
                   getText('.text-body-medium') ||
                   getText('.pv-top-card--list .text-body-medium');
  output += `HEADLINE: ${headline}\n`;

  // ── Location ──
  const location = getText('.text-body-small.inline.t-black--light.break-words') ||
                   getText('span.text-body-small.inline');
  output += `LOCATION: ${location}\n`;

  // ── About / Summary ──
  const aboutSection = document.querySelector('#about');
  let aboutText = '';
  if (aboutSection) {
    const aboutContainer = aboutSection.closest('section');
    if (aboutContainer) {
      const spans = aboutContainer.querySelectorAll('.inline-show-more-text span[aria-hidden="true"], .pv-shared-text-with-see-more span.visually-hidden, div.display-flex span[aria-hidden="true"]');
      aboutText = Array.from(spans).map(s => s.textContent.trim()).join(' ');
      if (!aboutText) {
        const allSpans = aboutContainer.querySelectorAll('span');
        for (const s of allSpans) {
          const t = s.textContent.trim();
          if (t.length > 50 && !t.includes('About') && !t.includes('see more')) {
            aboutText = t;
            break;
          }
        }
      }
    }
  }
  output += `\nABOUT:\n${aboutText || '(not found - try scrolling down to load the About section)'}\n`;

  // ── Experience ──
  output += '\n=== EXPERIENCE ===\n';
  const expSection = document.querySelector('#experience');
  if (expSection) {
    const expContainer = expSection.closest('section');
    if (expContainer) {
      const expItems = expContainer.querySelectorAll(':scope > div > div > div > ul > li.artdeco-list__item, :scope > div.pvs-list__outer-container > div > div > ul > li, :scope > div > div > ul > li');

      if (expItems.length > 0) {
        expItems.forEach((item, i) => {
          const spans = item.querySelectorAll('span[aria-hidden="true"]');
          const texts = Array.from(spans).map(s => s.textContent.trim()).filter(t => t);

          if (texts.length > 0) {
            output += `\n--- Role ${i + 1} ---\n`;
            texts.forEach(t => { output += `  ${t}\n`; });
          }
        });
      } else {
        // Fallback: grab all visible text from the section
        const allText = expContainer.querySelectorAll('span[aria-hidden="true"]');
        const texts = Array.from(allText).map(s => s.textContent.trim()).filter(t => t && t !== 'Experience');
        output += texts.join('\n  ') + '\n';
      }
    }
  } else {
    output += '(Experience section not found - scroll down to load it)\n';
  }

  // ── Education ──
  output += '\n=== EDUCATION ===\n';
  const eduSection = document.querySelector('#education');
  if (eduSection) {
    const eduContainer = eduSection.closest('section');
    if (eduContainer) {
      const spans = eduContainer.querySelectorAll('span[aria-hidden="true"]');
      const texts = Array.from(spans).map(s => s.textContent.trim()).filter(t => t && t !== 'Education');
      texts.forEach(t => { output += `  ${t}\n`; });
    }
  } else {
    output += '(Education section not found - scroll down to load it)\n';
  }

  // ── Skills ──
  output += '\n=== SKILLS ===\n';
  const skillsSection = document.querySelector('#skills');
  if (skillsSection) {
    const skillsContainer = skillsSection.closest('section');
    if (skillsContainer) {
      const spans = skillsContainer.querySelectorAll('span[aria-hidden="true"]');
      const skills = Array.from(spans)
        .map(s => s.textContent.trim())
        .filter(t => t && t !== 'Skills' && t.length < 60 && !t.includes('endorsement') && !t.includes('Show all'));
      output += skills.join(', ') + '\n';
    }
  } else {
    output += '(Skills section not found - scroll down to load it)\n';
  }

  // ── Certifications ──
  output += '\n=== CERTIFICATIONS ===\n';
  const certSection = document.querySelector('#licenses_and_certifications');
  if (certSection) {
    const certContainer = certSection.closest('section');
    if (certContainer) {
      const spans = certContainer.querySelectorAll('span[aria-hidden="true"]');
      const certs = Array.from(spans).map(s => s.textContent.trim()).filter(t => t && t.length < 100);
      certs.forEach(t => { output += `  ${t}\n`; });
    }
  } else {
    output += '(Not found)\n';
  }

  // ── Projects ──
  output += '\n=== PROJECTS ===\n';
  const projSection = document.querySelector('#projects');
  if (projSection) {
    const projContainer = projSection.closest('section');
    if (projContainer) {
      const spans = projContainer.querySelectorAll('span[aria-hidden="true"]');
      const projs = Array.from(spans).map(s => s.textContent.trim()).filter(t => t && t !== 'Projects');
      projs.forEach(t => { output += `  ${t}\n`; });
    }
  } else {
    output += '(Not found)\n';
  }

  // ── Profile URL ──
  output += `\nPROFILE URL: ${window.location.href}\n`;

  output += '\n=== END OF PROFILE DATA ===';
  output += '\n\nPaste this to Claude to update your portfolio!';

  return output;
}
