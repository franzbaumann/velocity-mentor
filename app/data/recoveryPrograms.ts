export type ProgramCategory =
  | "post-run"
  | "post-strength"
  | "rest-day"
  | "flexibility"
  | "injury-prevention"
  | "activation";

export type BodyPart = "upper" | "lower" | "full-body" | "core" | "hips" | "shoulders";

export type Duration = 10 | 20 | 30;

export interface Exercise {
  id: string;
  name: string;
  durationSeconds?: number;
  reps?: number;
  sets?: number;
  description: string;
  gifUrl: string;
  cues: string[];
}

export interface RecoveryProgram {
  id: string;
  title: string;
  subtitle: string;
  categories: ProgramCategory[];
  bodyParts: BodyPart[];
  durationMinutes: Duration;
  exercises: Exercise[];
  tags: string[];
}

const PLACEHOLDER_GIF = "https://placehold.co/400x300";

export const recoveryPrograms: RecoveryProgram[] = [
  {
    id: "post-run-lower-body-reset",
    title: "Post-Run Lower Body Reset",
    subtitle: "Downshift the legs after hard miles",
    categories: ["post-run"],
    bodyParts: ["lower", "hips"],
    durationMinutes: 20,
    tags: ["runner", "cooldown", "mobility"],
    exercises: [
      {
        id: "prlbr-calf-stretch",
        name: "Wall Calf Stretch",
        durationSeconds: 60,
        sets: 2,
        description: "Lengthen calves and reduce lower-leg stiffness after impact work.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Keep heel down", "Drive hips forward gently", "Breathe through the stretch"],
      },
      {
        id: "prlbr-quad-floss",
        name: "Standing Quad Floss",
        durationSeconds: 45,
        sets: 2,
        description: "Restore quad length and improve knee comfort.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Squeeze glute on standing leg", "Stay tall through chest", "Avoid pulling aggressively"],
      },
      {
        id: "prlbr-hip-90-90",
        name: "90/90 Hip Switch",
        reps: 10,
        sets: 2,
        description: "Open internal and external hip rotation with controlled transitions.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Move slowly", "Keep both sit bones grounded", "Rotate from hips, not low back"],
      },
      {
        id: "prlbr-hamstring-glide",
        name: "Supine Hamstring Glide",
        reps: 12,
        sets: 2,
        description: "Dynamic hamstring mobility without overloading the back.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Keep opposite leg bent", "Exhale on extension", "No pain behind knee"],
      },
      {
        id: "prlbr-ankle-rockers",
        name: "Ankle Dorsiflexion Rockers",
        reps: 12,
        sets: 2,
        description: "Rebuild ankle range after repetitive stride patterns.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Knee tracks over toes", "Heel stays planted", "Control each rep"],
      },
    ],
  },
  {
    id: "morning-activation",
    title: "Morning Activation",
    subtitle: "Quick wake-up for movement quality",
    categories: ["activation"],
    bodyParts: ["full-body"],
    durationMinutes: 10,
    tags: ["warmup", "energy", "daily"],
    exercises: [
      {
        id: "ma-breath-reset",
        name: "90/90 Breathing Reset",
        durationSeconds: 60,
        sets: 1,
        description: "Reset ribcage and core engagement before movement.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Long exhales", "Feel lower ribs drop", "Keep neck relaxed"],
      },
      {
        id: "ma-cat-camel",
        name: "Cat-Camel Flow",
        reps: 8,
        sets: 1,
        description: "Mobilize the spine and prepare shoulders/hips.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Segment each vertebra", "Move with breath", "No forcing end range"],
      },
      {
        id: "ma-glute-bridge",
        name: "Glute Bridge March",
        reps: 12,
        sets: 2,
        description: "Prime posterior chain while controlling pelvis.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Ribs down", "Drive through heels", "Keep hips level"],
      },
      {
        id: "ma-shoulder-cars",
        name: "Shoulder CARs",
        reps: 5,
        sets: 2,
        description: "Controlled shoulder circles to activate full range.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Slow circles", "Keep torso quiet", "Own every angle"],
      },
    ],
  },
  {
    id: "hip-flexor-glute-release",
    title: "Hip Flexor & Glute Release",
    subtitle: "Targeted hip opening for desk and run load",
    categories: ["flexibility"],
    bodyParts: ["hips", "lower"],
    durationMinutes: 20,
    tags: ["hips", "release", "mobility"],
    exercises: [
      {
        id: "hfgr-couch-stretch",
        name: "Couch Stretch",
        durationSeconds: 60,
        sets: 2,
        description: "Deep hip flexor stretch to reduce anterior hip tightness.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Posterior pelvic tilt", "Stay tall", "Ease in gradually"],
      },
      {
        id: "hfgr-pigeon",
        name: "Figure-4 Pigeon Hold",
        durationSeconds: 75,
        sets: 2,
        description: "Open glutes and deep rotators with relaxed breathing.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Square hips", "Support with blocks if needed", "Exhale deeper"],
      },
      {
        id: "hfgr-lateral-lunge",
        name: "Lateral Lunge Rock",
        reps: 10,
        sets: 2,
        description: "Mobilize adductors and groin for stride control.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Push hips back", "Keep chest up", "Shift smoothly side to side"],
      },
      {
        id: "hfgr-fire-hydrant",
        name: "Quadruped Fire Hydrant",
        reps: 12,
        sets: 2,
        description: "Activate glute medius for hip stability.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Do not rotate trunk", "Lift from hip", "Controlled lowering"],
      },
      {
        id: "hfgr-frog-breath",
        name: "Frog Pose Breathing",
        durationSeconds: 60,
        sets: 2,
        description: "Open inner hips while down-regulating tension.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Neutral spine", "Slow nasal breaths", "No pinching at groin"],
      },
    ],
  },
  {
    id: "upper-body-mobility",
    title: "Upper Body Mobility",
    subtitle: "Shoulder and thoracic reset for better posture",
    categories: ["flexibility"],
    bodyParts: ["upper", "shoulders"],
    durationMinutes: 20,
    tags: ["posture", "shoulder-health", "thoracic"],
    exercises: [
      {
        id: "ubm-thread-needle",
        name: "Thread the Needle",
        reps: 8,
        sets: 2,
        description: "Increase thoracic rotation and ease upper-back stiffness.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Reach long", "Keep hips stable", "Exhale into rotation"],
      },
      {
        id: "ubm-wall-slides",
        name: "Wall Slides",
        reps: 10,
        sets: 2,
        description: "Improve overhead patterning and shoulder control.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Ribs tucked", "Forearms stay on wall", "Move slowly"],
      },
      {
        id: "ubm-band-pullapart",
        name: "Band Pull-Aparts",
        reps: 15,
        sets: 2,
        description: "Activate posterior shoulder and improve scapular balance.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Soft elbows", "Lead with shoulder blades", "Do not shrug"],
      },
      {
        id: "ubm-doorway-pec",
        name: "Doorway Pec Stretch",
        durationSeconds: 45,
        sets: 2,
        description: "Lengthen chest and reduce rounded-shoulder tension.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Step forward gently", "Keep chin neutral", "Avoid low-back arch"],
      },
      {
        id: "ubm-prone-y",
        name: "Prone Y Raise",
        reps: 10,
        sets: 2,
        description: "Reinforce overhead scapular control and endurance.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Thumbs up", "Lift from upper back", "Keep neck long"],
      },
    ],
  },
  {
    id: "injury-prevention-knees",
    title: "Injury Prevention: Knees",
    subtitle: "Joint-friendly lower chain primer",
    categories: ["injury-prevention"],
    bodyParts: ["lower"],
    durationMinutes: 10,
    tags: ["knees", "stability", "prehab"],
    exercises: [
      {
        id: "ipk-tke",
        name: "Band Terminal Knee Extension",
        reps: 15,
        sets: 2,
        description: "Strengthen final knee extension and quad control.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Lock out smoothly", "Squeeze quad", "Control return"],
      },
      {
        id: "ipk-split-isometric",
        name: "Split Squat Isometric Hold",
        durationSeconds: 30,
        sets: 2,
        description: "Build tendon tolerance and alignment control.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Front knee tracks over mid-foot", "Upright torso", "Even weight through front foot"],
      },
      {
        id: "ipk-step-down",
        name: "Eccentric Step-Down",
        reps: 8,
        sets: 2,
        description: "Control knee valgus and improve deceleration mechanics.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Slow 3-second lower", "Hip stays level", "Tap heel lightly"],
      },
      {
        id: "ipk-calf-raise",
        name: "Single-Leg Calf Raise",
        reps: 12,
        sets: 2,
        description: "Support ankle-knee chain stiffness and force transfer.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Full range", "Pause at top", "Control down"],
      },
    ],
  },
  {
    id: "rest-day-full-body-flow",
    title: "Rest Day Full Body Flow",
    subtitle: "Longer low-intensity movement session",
    categories: ["rest-day", "flexibility"],
    bodyParts: ["full-body"],
    durationMinutes: 30,
    tags: ["rest-day", "flow", "recovery"],
    exercises: [
      {
        id: "rdfbf-box-breath",
        name: "Box Breathing",
        durationSeconds: 120,
        sets: 1,
        description: "Transition to parasympathetic state before mobility flow.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["4 in, 4 hold, 4 out, 4 hold", "Relax jaw and shoulders", "Stay nasal"],
      },
      {
        id: "rdfbf-worlds-greatest",
        name: "World's Greatest Stretch",
        reps: 6,
        sets: 2,
        description: "Integrate hips, thoracic spine, and hamstrings.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Step wide", "Rotate toward front leg", "Switch sides smoothly"],
      },
      {
        id: "rdfbf-down-dog",
        name: "Down Dog to Plank Wave",
        reps: 10,
        sets: 2,
        description: "Open posterior chain and shoulders in one flow.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Roll through spine", "Press floor away", "Long exhale each rep"],
      },
      {
        id: "rdfbf-cossack",
        name: "Cossack Squat",
        reps: 8,
        sets: 2,
        description: "Improve lateral hip mobility and adductor length.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Keep heel down", "Sit deep to one side", "Alternate sides with control"],
      },
      {
        id: "rdfbf-thoracic-bridge",
        name: "Thoracic Bridge Reach",
        reps: 6,
        sets: 2,
        description: "Restore rotational strength and shoulder extension.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Drive hips up", "Reach across body", "Keep planted hand stable"],
      },
      {
        id: "rdfbf-childs-pose",
        name: "Child's Pose Reset",
        durationSeconds: 90,
        sets: 1,
        description: "Finish with low-intensity breathing and spinal decompression.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Forehead grounded", "Reach long through arms", "Slow breathing cadence"],
      },
    ],
  },
  {
    id: "post-strength-recovery",
    title: "Post-Strength Recovery",
    subtitle: "Unload tissue after heavy lifting sessions",
    categories: ["post-strength"],
    bodyParts: ["full-body", "upper", "lower"],
    durationMinutes: 20,
    tags: ["lifting", "cooldown", "range-of-motion"],
    exercises: [
      {
        id: "psr-spine-roll",
        name: "Segmented Spine Roll Down",
        reps: 8,
        sets: 1,
        description: "Down-regulate spinal erector tone after loading.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Chin to chest first", "Move one segment at a time", "Soft knees"],
      },
      {
        id: "psr-lat-stretch",
        name: "Bench Lat Stretch",
        durationSeconds: 45,
        sets: 2,
        description: "Open lats and triceps after pull and press volume.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Hips back", "Neutral ribs", "Breathe into side body"],
      },
      {
        id: "psr-kneeling-hip-flexor",
        name: "Half-Kneeling Hip Flexor Stretch",
        durationSeconds: 45,
        sets: 2,
        description: "Restore hip extension after squats and deadlifts.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Posterior tilt", "Squeeze rear glute", "Keep torso upright"],
      },
      {
        id: "psr-thoracic-extension",
        name: "Foam Roller Thoracic Extension",
        reps: 10,
        sets: 1,
        description: "Recover thoracic extension for cleaner overhead mechanics.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Support head", "Extend over roller", "Do not overarch lumbar"],
      },
      {
        id: "psr-dead-bug",
        name: "Dead Bug Breathing",
        reps: 10,
        sets: 2,
        description: "Re-center trunk control after heavy compound lifts.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Lower back stays connected", "Exhale fully", "Move opposite arm and leg"],
      },
    ],
  },
  {
    id: "core-activation",
    title: "Core Activation",
    subtitle: "Fast trunk primer before run or lift",
    categories: ["activation"],
    bodyParts: ["core"],
    durationMinutes: 10,
    tags: ["core", "bracing", "prep"],
    exercises: [
      {
        id: "ca-hollow-hold",
        name: "Hollow Body Hold",
        durationSeconds: 30,
        sets: 3,
        description: "Build anterior chain tension and full-body bracing.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Lower back pressed down", "Ribs tucked", "Short controlled breaths"],
      },
      {
        id: "ca-side-plank",
        name: "Side Plank",
        durationSeconds: 30,
        sets: 2,
        description: "Activate lateral trunk and hip stabilizers.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Stack shoulders", "Straight line head to heels", "Drive floor away"],
      },
      {
        id: "ca-bird-dog",
        name: "Bird Dog",
        reps: 10,
        sets: 2,
        description: "Coordinate cross-body control with spinal neutrality.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Reach long both ways", "No hip shift", "Pause at full extension"],
      },
      {
        id: "ca-pallof",
        name: "Half-Kneeling Pallof Press",
        reps: 12,
        sets: 2,
        description: "Train anti-rotation stability relevant to running and lifting.",
        gifUrl: PLACEHOLDER_GIF,
        cues: ["Brace before pressing", "Keep shoulders square", "Slow return"],
      },
    ],
  },
];

export function getRecoveryProgramById(id: string): RecoveryProgram | undefined {
  return recoveryPrograms.find((program) => program.id === id);
}

type RecoveryProgramFilter = {
  durationMinutes?: Duration;
  category?: ProgramCategory;
  bodyPart?: BodyPart;
};

export function filterRecoveryPrograms(filter: RecoveryProgramFilter): RecoveryProgram[] {
  return recoveryPrograms.filter((program) => {
    if (filter.durationMinutes != null && program.durationMinutes !== filter.durationMinutes) {
      return false;
    }
    if (filter.category != null && !program.categories.includes(filter.category)) {
      return false;
    }
    if (filter.bodyPart != null && !program.bodyParts.includes(filter.bodyPart)) {
      return false;
    }
    return true;
  });
}
