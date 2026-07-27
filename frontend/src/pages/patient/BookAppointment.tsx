import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Confidence, DoctorDto, RecommendResponse, SlotDto } from '../../types';
import * as aiApi from '../../api/ai';
import { getDoctors, getSpecialties } from '../../api/doctors';
import { createAppointment, joinWaitlist } from '../../api/appointments';
import { fmtDateTime, getErrorMessage, isAiFallback, todayStr } from '../../utils';
import Button from '../../components/Button';
import Spinner from '../../components/Spinner';
import SlotGrid from '../../components/SlotGrid';
import StarRating from '../../components/StarRating';
import { IconSparkle } from '../../components/Icons';
import { toast } from '../../store/toasts';

/** Low / medium / high segmented confidence indicator. */
function ConfidenceMeter({ confidence }: { confidence: Confidence }) {
  return (
    <span className={`conf-meter conf-meter--${confidence}`} title={`${confidence} confidence`}>
      <span className="conf-meter__bars" aria-hidden="true">
        <span className="conf-meter__bar" />
        <span className="conf-meter__bar" />
        <span className="conf-meter__bar" />
      </span>
      {confidence} confidence
    </span>
  );
}

type Step = 1 | 2 | 3 | 'success';

interface ChosenDoctor {
  id: string;
  fullName: string;
  specialty: string;
}

export default function BookAppointment() {
  const [step, setStep] = useState<Step>(1);
  const [doctor, setDoctor] = useState<ChosenDoctor | null>(null);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayStr());
  const [slot, setSlot] = useState<SlotDto | null>(null);
  const [reason, setReason] = useState('');

  const stepIndex = step === 'success' ? 3 : step;

  return (
    <div className="page page--narrow">
      <div className="page-header">
        <div>
          <h2>Book an appointment</h2>
          <p className="page-subtitle">Tell us what is wrong — we will find the right doctor.</p>
        </div>
      </div>

      <ol className="wizard-steps">
        {['Choose a doctor', 'Pick a time', 'Confirm'].map((label, i) => (
          <li
            key={label}
            className={`wizard-step ${stepIndex === i + 1 ? 'wizard-step--active' : ''} ${
              stepIndex > i + 1 ? 'wizard-step--done' : ''
            }`}
          >
            <span className="wizard-step__num">{i + 1}</span> {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <StepDoctor
          description={description}
          setDescription={setDescription}
          onChoose={(d, reasonText) => {
            setDoctor(d);
            if (reasonText) setReason(reasonText);
            setSlot(null);
            setStep(2);
          }}
        />
      )}

      {step === 2 && doctor && (
        <StepTime
          doctor={doctor}
          date={date}
          setDate={(d) => {
            setDate(d);
            setSlot(null);
          }}
          slot={slot}
          setSlot={setSlot}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && doctor && slot && (
        <StepConfirm
          doctor={doctor}
          slot={slot}
          reason={reason}
          setReason={setReason}
          onBack={() => setStep(2)}
          onBooked={() => setStep('success')}
          onSlotTaken={() => {
            setSlot(null);
            setStep(2);
          }}
        />
      )}

      {step === 'success' && doctor && slot && (
        <div className="card success-card">
          <div className="success-card__check">✓</div>
          <h3>Appointment booked</h3>
          <p>
            {doctor.fullName} ({doctor.specialty}) — {fmtDateTime(slot.startTime)}
          </p>
          <p className="muted">
            You will receive a reminder before your visit. If your appointment is within 24 hours,
            you can complete your pre-visit intake from the dashboard.
          </p>
          <Link to="/patient">
            <Button>Back to dashboard</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

// --- Step 1: AI recommendation / manual choice ------------------------------

function StepDoctor({
  description,
  setDescription,
  onChoose,
}: {
  description: string;
  setDescription: (v: string) => void;
  onChoose: (d: ChosenDoctor, reason?: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [fallbackBanner, setFallbackBanner] = useState(false);

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await aiApi.recommend(description.trim());
      setResult(res);
    } catch (err) {
      if (isAiFallback(err)) {
        setFallbackBanner(true);
        setManual(true);
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stack">
      {!manual && (
        <form className="card stack" onSubmit={(e) => void ask(e)}>
          <label className="form-group">
            <span>Describe your concern</span>
            <textarea
              className="input"
              rows={3}
              required
              minLength={5}
              placeholder="e.g. I've had chest tightness when climbing stairs for two weeks…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {error && <p className="inline-error">{error}</p>}
          <div className="actions-row">
            <Button type="submit" className="btn--ai" loading={loading}>
              <IconSparkle size={16} /> Get recommendation
            </Button>
            <Button variant="ghost" onClick={() => setManual(true)}>
              Choose manually instead
            </Button>
          </div>
        </form>
      )}

      {result && !manual && (
        <div className="card stack">
          <div className="recommend-head">
            <span className="ai-badge">
              <IconSparkle size={13} /> AI
            </span>
            <h3>
              Recommended: <span className="accent">{result.specialty}</span>
            </h3>
            <ConfidenceMeter confidence={result.confidence} />
          </div>
          <p className="muted">{result.rationale}</p>
          <div className="doctor-cards">
            {result.doctors.slice(0, 2).map((d) => (
              <div key={d.id} className="doctor-card">
                <div className="doctor-card__avatar">{d.fullName.slice(0, 1)}</div>
                <div className="doctor-card__info">
                  <strong>{d.fullName}</strong>
                  <span>{d.specialty}</span>
                </div>
                <Button size="sm" onClick={() => onChoose(d, description.trim())}>
                  Accept
                </Button>
              </div>
            ))}
          </div>
          <Button variant="ghost" onClick={() => setManual(true)}>
            Choose manually
          </Button>
        </div>
      )}

      {manual && (
        <ManualDoctorPicker
          fallbackBanner={fallbackBanner}
          onChoose={(d) => onChoose(d, description.trim() || undefined)}
          onBackToAi={() => {
            setManual(false);
            setFallbackBanner(false);
          }}
        />
      )}
    </div>
  );
}

function ManualDoctorPicker({
  onChoose,
  onBackToAi,
  fallbackBanner,
}: {
  onChoose: (d: ChosenDoctor) => void;
  onBackToAi: () => void;
  fallbackBanner: boolean;
}) {
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [specialty, setSpecialty] = useState('');
  const [doctors, setDoctors] = useState<DoctorDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSpecialties()
      .then(setSpecialties)
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  useEffect(() => {
    if (!specialty) {
      setDoctors(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDoctors(specialty)
      .then((d) => {
        if (!cancelled) setDoctors(d);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [specialty]);

  return (
    <div className="card stack">
      {fallbackBanner && (
        <div className="info-banner">
          The AI recommender is temporarily unavailable — please choose a specialty yourself.
        </div>
      )}
      <label className="form-group">
        <span>Specialty</span>
        <select className="input" value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
          <option value="">Select a specialty…</option>
          {specialties.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {loading && <Spinner block label="Loading doctors…" />}
      {error && <p className="inline-error">{error}</p>}
      {doctors && doctors.length === 0 && <p className="muted">No doctors in this specialty yet.</p>}
      {doctors && doctors.length > 0 && (
        <div className="doctor-cards">
          {doctors.map((d) => (
            <div key={d.id} className="doctor-card">
              <div className="doctor-card__avatar">{d.fullName.slice(0, 1)}</div>
              <div className="doctor-card__info">
                <strong>{d.fullName}</strong>
                <span>{d.specialty}</span>
                {d.avgRating != null && (
                  <span className="doctor-card__rating">
                    <StarRating value={Math.round(d.avgRating)} size={13} />
                    {d.avgRating.toFixed(1)} ({d.ratingCount})
                  </span>
                )}
                {d.bio && <span className="doctor-card__bio">{d.bio}</span>}
              </div>
              <Button
                size="sm"
                onClick={() => onChoose({ id: d.id, fullName: d.fullName, specialty: d.specialty })}
              >
                Select
              </Button>
            </div>
          ))}
        </div>
      )}
      {!fallbackBanner && (
        <Button variant="ghost" onClick={onBackToAi}>
          Back to AI recommendation
        </Button>
      )}
    </div>
  );
}

// --- Step 2: date + slot -----------------------------------------------------

function StepTime({
  doctor,
  date,
  setDate,
  slot,
  setSlot,
  onBack,
  onNext,
}: {
  doctor: ChosenDoctor;
  date: string;
  setDate: (d: string) => void;
  slot: SlotDto | null;
  setSlot: (s: SlotDto) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [joining, setJoining] = useState(false);
  const [waitlisted, setWaitlisted] = useState<number | null>(null);

  const joinList = async () => {
    setJoining(true);
    try {
      const entry = await joinWaitlist(doctor.id, date);
      setWaitlisted(entry.position);
      toast(`Added to the waitlist — you are #${entry.position}.`, 'success');
    } catch (err) {
      toast(getErrorMessage(err), 'error');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="card stack">
      <p>
        Booking with <strong>{doctor.fullName}</strong> ({doctor.specialty})
      </p>
      <label className="form-group form-group--inline">
        <span>Date</span>
        <input
          className="input"
          type="date"
          min={todayStr()}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setWaitlisted(null);
          }}
        />
      </label>
      {date && (
        <SlotGrid
          doctorId={doctor.id}
          date={date}
          value={slot?.startTime ?? null}
          onSelect={setSlot}
          renderNoSlots={() =>
            waitlisted !== null ? (
              <p className="success-text">
                You are #{waitlisted} on the waitlist for this day. We will notify you if a slot
                opens up.
              </p>
            ) : (
              <Button variant="secondary" loading={joining} onClick={() => void joinList()}>
                Join waitlist for this day
              </Button>
            )
          }
        />
      )}
      <div className="actions-row">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button disabled={!slot} onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}

// --- Step 3: confirm ---------------------------------------------------------

function StepConfirm({
  doctor,
  slot,
  reason,
  setReason,
  onBack,
  onBooked,
  onSlotTaken,
}: {
  doctor: ChosenDoctor;
  slot: SlotDto;
  reason: string;
  setReason: (v: string) => void;
  onBack: () => void;
  onBooked: () => void;
  onSlotTaken: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await createAppointment({
        doctorId: doctor.id,
        startTime: slot.startTime,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      onBooked();
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      if (status === 409) {
        toast('Sorry — that slot was just taken. Please pick another one.', 'error');
        onSlotTaken();
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card stack">
      <h3>Confirm your appointment</h3>
      <dl className="confirm-grid">
        <div>
          <dt>Doctor</dt>
          <dd>
            {doctor.fullName} ({doctor.specialty})
          </dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>{fmtDateTime(slot.startTime)}</dd>
        </div>
      </dl>
      <label className="form-group">
        <span>Reason for visit (optional)</span>
        <textarea
          className="input"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && <p className="inline-error">{error}</p>}
      <div className="actions-row">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button loading={submitting} onClick={() => void confirm()}>
          Confirm booking
        </Button>
      </div>
    </div>
  );
}
