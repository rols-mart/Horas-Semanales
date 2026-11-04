// Weekly goal in hours, overridden by the popup setting.
let TARGET = 25.5;
// How a short or long day moves the next goals: 'spread' over the remaining
// days, or 'next' all to the following day. Overridden by the popup setting.
let GOAL_MODE = 'spread';
// Official office days per week; the daily goal is the weekly goal divided by this.
const OFFICE_DAYS = 3;
const NUM = /^\d*\.?\d+$/;
const TIMES = /\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)/;
const MIN_MS = 60000;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// chrome.runtime disappears if the extension is reloaded while the tab stays open.
const alive = () => !!(chrome.runtime && chrome.runtime.id);
const send = (msg, cb) => alive() && chrome.runtime.sendMessage(msg, cb);

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
// Decimal hours to "1 hora y 35 mins".
const fmtDur = (hours) => {
  const mins = Math.ceil(hours * 60 - 1e-6);
  const hh = Math.floor(mins / 60);
  const parts = [hh && `${hh} ${hh === 1 ? 'hora' : 'horas'}`, mins % 60 && `${mins % 60} mins`];
  return parts.filter(Boolean).join(' y ') || 'menos de 1 min';
};

const PROFILES = {
  normal: (x) => `Faltan ${x} h para ${TARGET}`,
  axel: (x) => `Padrino te faltan ${x} horas` +
    (x > 10 ? ' | naaahmbre, padrino te faltan un chorro de horas pa' : ''),
  tazuki: (x) => `eh we te faltan ${x} horas papi`,
};

// Steps to make the exit notification visible, by operating system.
const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
const ALARM_HELP = /mac/i.test(platform)
  ? ['Ajustes del Sistema → Notificaciones → Google Chrome: activa "Allow notifications".',
    'En "Alert Style" elige "Persistent".',
    'Desactiva "No molestar" / Focus, o las notificaciones no se mostrarán.']
  : /win/i.test(platform)
    ? ['Configuración → Sistema → Notificaciones: activa las notificaciones y "Google Chrome".',
      'Activa "Mostrar banners de notificación" para Google Chrome.',
      'Desactiva el Asistente de concentración / No molestar, o las notificaciones se ocultarán.']
    : ['Permite las notificaciones de Google Chrome en la configuración del sistema.',
      'Desactiva el modo "No molestar", o las notificaciones se ocultarán.'];

// Files under media/<profile>/<success|fail>/. Add new files here by hand.
const MEDIA = {
  axel: { success: ['1.gif'], fail: ['1.jpeg'] },
  tazuki: { success: ['1.gif', '2.gif', '3.gif'], fail: ['1.gif', '3.gif'] },
};
const pickMedia = (profile, kind) => {
  const files = (MEDIA[profile] || {})[kind];
  return files && files.length ? `media/${profile}/${kind}/${files[Math.floor(Math.random() * files.length)]}` : null;
};

// Where each day's data comes from, with its color in the week table.
const STATES = {
  phone: { label: 'Celular', color: '#cfe3ff', help: 'llegada marcada desde el celular' },
  browser: { label: 'Navegador', color: '#ffd9b3', help: 'llegada sobrescrita en el navegador' },
  official: { label: 'Oficial', color: '#c9ecc9', help: 'horas oficiales de la tabla' },
  assumed: {
    label: 'Asumido',
    color: '#fff3b0',
    help: 'día con llegada y sin hora oficial: se asumen las horas de la alarma, o la meta diaria si no hubo alarma',
  },
  holiday: { label: 'Festivo/Vacaciones', color: '#e3d7f5', help: 'día festivo o de vacaciones (horas sin horario)' },
};

// Pure: state of each day and the cumulative goal for today.
// days: [{ hours, start }] (Sun..Sat), hasStamp(i): the day has an arrival mark,
// alarmHours(i): the day's goal when an alarm was set, used for assumed days.
const analyzeWeek = (days, todayIdx, hasStamp, alarmHours = () => undefined) => {
  const nominal = TARGET / OFFICE_DAYS;
  const states = days.map((d, i) => {
    if (d.hours > 0) return d.start ? 'official' : 'holiday';
    if (!hasStamp(i) || i > todayIdx) return null;
    return i < todayIdx ? 'assumed' : 'stamped';
  });
  // Days before today that already count toward the week.
  const past = states.flatMap((s, i) => (i < todayIdx && s
    ? [{ s, hours: s === 'assumed' ? alarmHours(i) ?? nominal : days[i].hours }] : []));
  const done = past.reduce((sum, p) => sum + p.hours, 0);
  const counted = past.length;
  // 'next': be at day-number x daily goal by the end of today, so the whole gap
  // lands on today. 'spread': split what is missing over the days left.
  const dayNo = Math.min(counted + 1, OFFICE_DAYS);
  const objective = Math.max(0, GOAL_MODE === 'next'
    ? dayNo * nominal - done
    : (TARGET - done) / Math.max(OFFICE_DAYS - counted, 1));
  return { states, nominal, done, counted, objective, assumed: past.filter((p) => p.s === 'assumed').length };
};

// ponytail: finds the table by its "Week Office Hours" header text.
const header = [...document.querySelectorAll('td, th')]
  .find((el) => el.textContent.trim() === 'Week Office Hours');
const table = header && header.closest('table');

if (table) {
  // Only cells under the header's horizontal span (Sun..Sat).
  const h = header.getBoundingClientRect();
  const under = (el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    return r.top >= h.bottom && x >= h.left && x <= h.right;
  };

  // One entry per row that has hours under the header.
  const rows = [...table.querySelectorAll('tr')].flatMap((tr) => {
    const cells = [...tr.children].filter(under).filter((el) => NUM.test(el.textContent.trim()));
    if (!cells.length) return [];
    // The tooltip of each cell has the official times: "Name (09:00 - 17:52)".
    const days = cells.map((el) => {
      const times = TIMES.exec((el.querySelector('[title]') || el).title || '');
      return { hours: parseFloat(el.textContent), start: times && times[1], end: times && times[2] };
    });
    const total = days.reduce((sum, d) => sum + d.hours, 0);
    return [{ name: tr.children[0].textContent.trim(), total, days }];
  });

  // Current week = newest fiscal year and newest fiscal week selected.
  const isLatest = (id) => {
    const sel = document.getElementById(id);
    if (!sel) return null;
    return +sel.value === Math.max(...[...sel.options].map((o) => +o.value));
  };
  const fy = isLatest('dd-fy');
  const fw = isLatest('dd-fw');
  const week = fy === null || fw === null ? 'unknown' : fy && fw ? 'current' : 'past';

  chrome.storage.sync.get({ profile: 'normal', arrivals: {}, alarms: {}, target: TARGET, goalMode: GOAL_MODE }, ({
    profile, arrivals, alarms, target, goalMode,
  }) => {
    if (target > 0) TARGET = target;
    if (goalMode === 'next' || goalMode === 'spread') GOAL_MODE = goalMode;
    const box = document.createElement('div');
    const many = rows.length > 1;
    box.style.cssText = `margin:6px 0 20px;font:${many ? 'normal 18px' : 'bold 20px'} sans-serif;text-align:center`;
    rows.forEach(({ name, total }, i) => {
      const left = TARGET - total;
      // Custom profile text only applies to the first row.
      const text = i === 0 ? PROFILES[profile] || PROFILES.normal : PROFILES.normal;
      const msg = text(left.toFixed(2));
      const line = document.createElement('div');
      if (many && i === 0) line.style.fontWeight = 'bold';
      line.textContent = `${name.split(/\s+/)[0]}: ${total.toFixed(2)} h | ` +
        (left > 0 ? msg : `Meta de ${TARGET} h cumplida`);
      box.append(line);
    });
    if (week === 'unknown') {
      const note = document.createElement('div');
      note.style.cssText = 'font:normal 14px sans-serif;color:#8a5a00';
      note.textContent = 'No se pudo verificar la semana fiscal, solo se muestran los totales.';
      box.append(note);
    }

    const first = rows[0];
    const current = week === 'current';
    let selected = first;
    let timer;
    // Phone arrivals by local day, only for the first row.
    const phone = {};
    // Arrival marks typed in the browser: arrivals[name][day] = { h, m }.
    const stamps = (name) => (arrivals[name] && !('day' in arrivals[name]) ? arrivals[name] : {});
    const saveStamp = (name, key, hh, mm) => {
      const cutoff = dayKey(new Date(Date.now() - 21 * DAY_MS));
      Object.keys(arrivals).forEach((n) => {
        arrivals[n] = Object.fromEntries(Object.entries(stamps(n)).filter(([k]) => k >= cutoff));
      });
      arrivals[name] = { ...arrivals[name], [key]: { h: hh, m: mm } };
      if (alive()) chrome.storage.sync.set({ arrivals });
    };

    // Goal of the days the alarm was set, alarms[day] = hours (first row only).
    // Removed when the alarm is canceled (hours undefined).
    const setAlarmHours = (key, hours) => {
      const cutoff = dayKey(new Date(Date.now() - 21 * DAY_MS));
      alarms = Object.fromEntries(Object.entries(alarms).filter(([k]) => k >= cutoff && k !== key));
      if (hours !== undefined) alarms[key] = hours;
      if (alive()) chrome.storage.sync.set({ alarms });
    };

    // State of every day of the week for one person.
    const weekModel = (person) => {
      const now = new Date();
      const todayIdx = now.getDay();
      const dateOf = (i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayIdx + i);
      const mine = stamps(person.name);
      const stampOf = (i) => {
        const date = dateOf(i);
        const key = dayKey(date);
        if (mine[key]) {
          return { source: 'browser', at: new Date(date.getFullYear(), date.getMonth(), date.getDate(), mine[key].h, mine[key].m) };
        }
        if (person === first && phone[key]) return { source: 'phone', at: new Date(Math.ceil(phone[key] / MIN_MS) * MIN_MS) };
        return null;
      };
      const alarmHoursOf = (i) => (person === first ? alarms[dayKey(dateOf(i))] : undefined);
      const a = analyzeWeek(person.days, todayIdx, (i) => !!stampOf(i), alarmHoursOf);
      const days = person.days.map((d, i) => {
        const stamp = stampOf(i);
        return {
          ...d,
          i,
          date: dateOf(i),
          stamp,
          state: a.states[i] === 'stamped' ? stamp.source : a.states[i],
          // Hours assumed for the day when there is no official time.
          fromAlarm: alarmHoursOf(i) !== undefined,
          assumedHours: alarmHoursOf(i) ?? a.nominal,
        };
      });
      return { ...a, todayIdx, days, now };
    };

    // Two boxes: what to do today, and the week as a whole.
    const section = (title) => {
      const fs = document.createElement('fieldset');
      fs.style.cssText = 'margin:12px auto 0;max-width:760px;padding:6px 14px 10px;border:1px solid #999';
      fs.append(Object.assign(document.createElement('legend'), {
        textContent: title,
        style: 'font:bold 15px sans-serif;padding:0 6px',
      }));
      return fs;
    };
    const dailyBox = section('Objetivo diario');
    const weeklyBox = section('Objetivo semanal');
    const slot = document.createElement('div');
    const tableSlot = document.createElement('div');
    dailyBox.append(slot);
    weeklyBox.append(tableSlot);
    const dayLabel = (m) => (m.counted >= OFFICE_DAYS ? 'Día extra' : `Día ${m.counted + 1} de ${OFFICE_DAYS}`);

    // Week table for the selected person, with legend and phone accuracy.
    const drawTable = () => {
      tableSlot.replaceChildren();
      const person = selected;
      if (!person) return;
      const m = weekModel(person);
      const cell = (text, bg, bold) => Object.assign(document.createElement('td'), {
        textContent: text,
        style: `border:1px solid #999;padding:4px 10px;background:${bg || '#fff'}${bold ? ';font-weight:bold' : ''}`,
      });
      const line = (cells) => {
        const r = document.createElement('tr');
        r.append(...cells);
        return r;
      };
      const cols = m.days.filter((d) => d.state || d.i === m.todayIdx);
      const colour = (d) => (d.state ? STATES[d.state].color : '#fff');
      const estimate = (d) => (d.stamp && !d.hours ? Math.max(0, (m.now - d.stamp.at) / HOUR_MS) : null);
      const rowOf = (title, fn) => line([cell(title, '#eee', true), ...cols.map((d) => cell(fn(d), colour(d)))]);

      const grid = document.createElement('table');
      grid.style.cssText = 'border-collapse:collapse;margin:8px auto;font:normal 14px sans-serif';
      grid.append(
        line([cell('', '#eee'), ...cols.map((d) => cell(`${DAY_NAMES[d.i]} ${d.date.getDate()}`, '#eee', true))]),
        rowOf('Llegada', (d) => (d.state === 'official' ? d.start : d.stamp ? fmt(d.stamp.at) : '–')),
        rowOf('Salida', (d) => (d.state === 'official' ? d.end : '–')),
        rowOf('Horas', (d) => {
          if (d.state === 'official' || d.state === 'holiday') return d.hours.toFixed(2);
          if (d.state === 'assumed') return d.assumedHours.toFixed(2);
          return estimate(d) === null ? '–' : `~${estimate(d).toFixed(2)}`;
        }),
        rowOf('Objetivo', (d) => {
          if (d.i === m.todayIdx) return m.objective.toFixed(2);
          return d.state ? m.nominal.toFixed(2) : '–';
        }),
        rowOf('Fuente', (d) => {
          if (d.state === 'assumed') return `Asumido (${d.fromAlarm ? 'alarma' : +m.nominal.toFixed(2)})`;
          return d.state ? STATES[d.state].label : 'Sin llegada';
        }),
      );

      const text = (content, style) => Object.assign(document.createElement('div'), {
        textContent: content,
        style: `font:normal 14px sans-serif;margin-top:4px;${style || ''}`,
      });
      const legend = document.createElement('div');
      legend.style.cssText = 'font:normal 13px sans-serif;margin-top:6px';
      Object.values(STATES).forEach((s) => {
        const item = Object.assign(document.createElement('span'), {
          textContent: s.label,
          title: s.help,
          style: `background:${s.color};border:1px solid #999;padding:2px 8px;margin:0 4px;cursor:help`,
        });
        legend.append(item);
      });
      tableSlot.append(
        grid,
        text(`Meta semanal: ${TARGET} h | Contadas hasta ayer: ${m.done.toFixed(2)} h`, 'font-weight:bold'),
        legend,
      );

      // Phone mark vs official arrival (browser overrides are left out).
      if (person === first) {
        const diffs = m.days.flatMap((d) => {
          const raw = phone[dayKey(d.date)];
          if (!raw || !d.start) return [];
          const [sh, sm] = d.start.split(':').map(Number);
          const official = new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate(), sh, sm).getTime();
          return [(official - raw) / MIN_MS];
        });
        const n = diffs.length;
        const bias = diffs.reduce((sum, v) => sum + v, 0) / (n || 1);
        const error = diffs.reduce((sum, v) => sum + Math.abs(v), 0) / (n || 1);
        tableSlot.append(text(n
          ? `Exactitud celular vs oficial (${n} día${n > 1 ? 's' : ''}): error promedio ${error.toFixed(1)} min | ` +
            `el celular marcó ${Math.abs(bias).toFixed(1)} min ${bias >= 0 ? 'antes' : 'después'} que el oficial`
          : 'Exactitud celular vs oficial: aún no hay días con marca del celular y hora oficial.'));
      }
    };

    const render = () => {
      clearInterval(timer);
      slot.replaceChildren();
      const person = selected;
      if (!person) return;
      const m = weekModel(person);
      const todayKey = dayKey(m.now);
      const reportedToday = (person.days[m.todayIdx] || { hours: 0 }).hours;
      let update = () => {};
      // The daily box has nothing to say once the weekly goal is met.
      dailyBox.style.display = person.total < TARGET ? '' : 'none';

      // Arrival form, unless the weekly goal is already met.
      if (person.total < TARGET) {
        const label = profile === 'tazuki' ? 'aquiorallegastehoy' : 'Hora de llegada';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-top:8px;font:normal 18px sans-serif';
        // Arrival is always AM, so only hour (00-11) and minute selects.
        const pick = (values) => {
          const sel = document.createElement('select');
          sel.style.font = 'inherit';
          sel.add(new Option('--', ''));
          values.forEach((v) => sel.add(new Option(String(v).padStart(2, '0'), v)));
          return sel;
        };
        const hour = pick(Array.from({ length: 12 }, (_, i) => i));
        const minute = pick(Array.from({ length: 60 }, (_, i) => i));
        const out = document.createElement('b');
        const live = document.createElement('div');
        const lastDay = m.counted >= OFFICE_DAYS - 1;

        const calc = () => {
          if (hour.value === '' || minute.value === '') return null;
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +hour.value, +minute.value);
          // Round up to the minute (1s tolerance), so nobody leaves early.
          const leaveMs = start.getTime() + m.objective * HOUR_MS;
          const leave = new Date(Math.ceil((leaveMs - 1000) / MIN_MS) * MIN_MS);
          // Today's hours: reported if present, else estimated from arrival.
          const worked = reportedToday > 0 ? reportedToday : Math.max(0, (now - start) / HOUR_MS);
          return { leave, worked, left: m.objective - worked };
        };
        update = () => {
          const r = calc();
          out.textContent = r ? ` → Hora de salida: ${fmt(r.leave)}` : '';
          live.textContent = !r ? '' : r.left > 0
            ? `Llevas ~${r.worked.toFixed(2)} h hoy | Faltan ${fmtDur(r.left)} ahora ` +
              `(objetivo de hoy: ${m.objective.toFixed(2)} h)`
            : lastDay ? `Meta de ${TARGET} h cumplida` : `Objetivo de hoy cumplido (${m.objective.toFixed(2)} h)`;
        };

        // Alarm every day for the first row, once no earlier day is assumed, so it
        // never has to be redone when the official hours arrive. It still needs an
        // arrival time (calc), and day 1 has no earlier day to wait for.
        const canAlarm = person === first && !m.assumed;
        const alarm = document.createElement('button');
        const help = document.createElement('div');
        if (canAlarm) {
          // Notification help, visible while an alarm is set.
          help.style.cssText = 'display:none;margin:8px auto 0;max-width:520px;padding:8px;' +
            'border:1px solid #999;font:normal 14px sans-serif;text-align:left';
          const steps = document.createElement('ul');
          ALARM_HELP.forEach((step) => steps.append(Object.assign(document.createElement('li'), { textContent: step })));
          help.append(Object.assign(document.createElement('b'), { textContent: 'Para ver la notificación:' }), steps);

          alarm.style.font = 'inherit';
          alarm.textContent = 'Setear alarma';
          // While an alarm is set, the same button cancels it.
          let isSet = false;
          const showSet = (when) => {
            isSet = true;
            alarm.textContent = `Alarma puesta: ${fmt(new Date(when))} (clic para quitar)`;
            help.style.display = 'block';
          };
          alarm.onclick = () => {
            if (!alive()) return (alarm.textContent = 'Recarga la página (la extensión se actualizó)');
            if (isSet) {
              send({ cancel: true });
              setAlarmHours(todayKey);
              isSet = false;
              alarm.textContent = 'Setear alarma';
              help.style.display = 'none';
              return;
            }
            const r = calc();
            if (!r) return (alarm.textContent = 'Elige la hora de llegada');
            if (r.leave <= Date.now()) return (alarm.textContent = 'La hora de salida ya pasó');
            send({ when: r.leave.getTime() });
            // Tomorrow, if this day has no official hours yet, these hours are assumed.
            setAlarmHours(todayKey, m.objective);
            showSet(r.leave);
          };
          // Show the alarm already scheduled in the browser, if any.
          send({ get: true }, (when) => when && showSet(when));
        }

        hour.onchange = minute.onchange = () => {
          update();
          if (!calc()) return;
          saveStamp(person.name, todayKey, +hour.value, +minute.value);
          drawTable();
        };

        // Saved mark first, then the phone mark (AM only).
        let initial = stamps(person.name)[todayKey];
        if (!initial && person === first && phone[todayKey]) {
          const d = new Date(Math.ceil(phone[todayKey] / MIN_MS) * MIN_MS);
          if (d.getHours() < 12) initial = { h: d.getHours(), m: d.getMinutes() };
        }
        if (initial) {
          hour.value = initial.h;
          minute.value = initial.m;
        }
        update();

        wrap.append(`${label}: `, hour, ' : ', minute, ' AM', out, live);
        if (m.assumed) {
          wrap.append(Object.assign(document.createElement('div'), {
            textContent: `Hora estimada: no es fiable hasta que esté la hora oficial (hay ` +
              `${m.assumed} día${m.assumed > 1 ? 's' : ''} con horas asumidas).` +
              (person === first ? ' La alarma estará disponible cuando esté la hora oficial.' : ''),
            style: 'font:normal 14px sans-serif;margin-top:4px;color:#8a5a00',
          }));
        }
        if (canAlarm) wrap.append(alarm, help);
        const goal = Object.assign(document.createElement('div'), {
          textContent: `${dayLabel(m)} | Objetivo de hoy: ${m.objective.toFixed(2)} h`,
          style: 'font:bold 16px sans-serif',
        });
        const adjust = Object.assign(document.createElement('div'), {
          textContent: `Ajuste del objetivo: ${GOAL_MODE === 'next' ? 'pasa al día siguiente' : 'repartido entre los días restantes'}`,
          style: 'font:normal 14px sans-serif;margin-top:2px',
        });
        slot.append(goal, adjust, wrap);
      }

      drawTable();
      timer = setInterval(() => {
        update();
        drawTable();
      }, MIN_MS);
    };

    if (current) {
      if (many) {
        const who = document.createElement('select');
        who.style.font = 'inherit';
        rows.forEach((r, i) => who.add(new Option(r.name, i)));
        who.onchange = () => {
          selected = rows[+who.value];
          render();
        };
        const whoWrap = document.createElement('div');
        whoWrap.style.marginTop = '8px';
        whoWrap.append('Persona: ', who);
        box.append(whoWrap);
      }
      box.append(dailyBox, weeklyBox);
      render();
      // Phone arrivals load in the background; redraw when they arrive.
      if (first) {
        send({ phone: true }, (list) => {
          if (!list) return;
          list.forEach((ts) => (phone[dayKey(new Date(ts))] = ts));
          render();
        });
      }
    }
    table.after(box);

    const showMedia = (kind) => {
      const path = pickMedia(profile, kind);
      if (!path || !alive() || document.getElementById('horas-gif')) return;
      const img = document.createElement('img');
      img.id = 'horas-gif';
      img.src = chrome.runtime.getURL(path);
      img.style.cssText = 'position:fixed;right:20px;bottom:20px;max-width:300px;z-index:99999;cursor:pointer';
      img.onclick = () => img.remove();
      document.body.append(img);
    };

    // Success when the first row met the goal; fail only for a past week that did not.
    if (first && first.total >= TARGET) showMedia('success');
    else if (first && week === 'past') showMedia('fail');
    let typed = '';
    document.addEventListener('keydown', (e) => {
      if (/^(input|textarea|select)$/i.test(e.target.tagName) || e.key.length !== 1) return;
      typed = (typed + e.key.toUpperCase()).slice(-6);
      if (typed.endsWith('DANCE')) showMedia('success');
      // Test: fires the exit notification through the alarm in 5 seconds.
      if (typed === 'ALARMA') send({ when: Date.now() + 5000, name: 'prueba' });
    });
  });
}
