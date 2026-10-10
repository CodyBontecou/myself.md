import {
  quantities,
  categories,
  androidTypes,
  special,
  characteristics,
} from '../client/health-types.js';
import { record } from '../core/data.js';

// Mock units and category values follow @kingstinct/react-native-healthkit 16.1 generated identifiers.
// These are fictional readings, not clinical reference ranges.
/** @type {Record<string,[number,string]>} */
const quantityReadings = {
  HKQuantityTypeIdentifierActiveEnergyBurned: [180, 'kcal'],
  HKQuantityTypeIdentifierAppleExerciseTime: [30, 'min'],
  HKQuantityTypeIdentifierAppleMoveTime: [30, 'min'],
  HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances: [4.2, 'count'],
  HKQuantityTypeIdentifierAppleSleepingWristTemperature: [36.6, 'degC'],
  HKQuantityTypeIdentifierAppleStandTime: [30, 'min'],
  HKQuantityTypeIdentifierAppleWalkingSteadiness: [0.2, '%'],
  HKQuantityTypeIdentifierAtrialFibrillationBurden: [0.2, '%'],
  HKQuantityTypeIdentifierBasalBodyTemperature: [36.6, 'degC'],
  HKQuantityTypeIdentifierBasalEnergyBurned: [180, 'kcal'],
  HKQuantityTypeIdentifierBloodAlcoholContent: [0.2, '%'],
  HKQuantityTypeIdentifierBloodGlucose: [1.5, 'mg/dL'],
  HKQuantityTypeIdentifierBloodPressureDiastolic: [118, 'mmHg'],
  HKQuantityTypeIdentifierBloodPressureSystolic: [118, 'mmHg'],
  HKQuantityTypeIdentifierBodyFatPercentage: [0.2, '%'],
  HKQuantityTypeIdentifierBodyMass: [72, 'kg'],
  HKQuantityTypeIdentifierBodyMassIndex: [23.5, 'count'],
  HKQuantityTypeIdentifierBodyTemperature: [36.6, 'degC'],
  HKQuantityTypeIdentifierCrossCountrySkiingSpeed: [1.4, 'm/s'],
  HKQuantityTypeIdentifierCyclingCadence: [72, 'count/min'],
  HKQuantityTypeIdentifierCyclingFunctionalThresholdPower: [180, 'W'],
  HKQuantityTypeIdentifierCyclingPower: [180, 'W'],
  HKQuantityTypeIdentifierCyclingSpeed: [1.4, 'm/s'],
  HKQuantityTypeIdentifierDietaryBiotin: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryCaffeine: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryCalcium: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryCarbohydrates: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryChloride: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryCholesterol: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryChromium: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryCopper: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryEnergyConsumed: [180, 'kcal'],
  HKQuantityTypeIdentifierDietaryFatMonounsaturated: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryFatPolyunsaturated: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryFatSaturated: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryFatTotal: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryFiber: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryFolate: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryIodine: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryIron: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryMagnesium: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryManganese: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryMolybdenum: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryNiacin: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryPantothenicAcid: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryPhosphorus: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryPotassium: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryProtein: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryRiboflavin: [0.5, 'g'],
  HKQuantityTypeIdentifierDietarySelenium: [0.5, 'g'],
  HKQuantityTypeIdentifierDietarySodium: [0.5, 'g'],
  HKQuantityTypeIdentifierDietarySugar: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryThiamin: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryVitaminA: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryVitaminB12: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryVitaminB6: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryVitaminC: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryVitaminD: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryVitaminE: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryVitaminK: [0.5, 'g'],
  HKQuantityTypeIdentifierDietaryWater: [250, 'mL'],
  HKQuantityTypeIdentifierDietaryZinc: [0.5, 'g'],
  HKQuantityTypeIdentifierDistanceCrossCountrySkiing: [950, 'm'],
  HKQuantityTypeIdentifierDistanceCycling: [950, 'm'],
  HKQuantityTypeIdentifierDistanceDownhillSnowSports: [950, 'm'],
  HKQuantityTypeIdentifierDistancePaddleSports: [950, 'm'],
  HKQuantityTypeIdentifierDistanceRowing: [950, 'm'],
  HKQuantityTypeIdentifierDistanceSkatingSports: [950, 'm'],
  HKQuantityTypeIdentifierDistanceSwimming: [950, 'm'],
  HKQuantityTypeIdentifierDistanceWalkingRunning: [950, 'm'],
  HKQuantityTypeIdentifierDistanceWheelchair: [950, 'm'],
  HKQuantityTypeIdentifierElectrodermalActivity: [3e-6, 'S'],
  HKQuantityTypeIdentifierEnvironmentalAudioExposure: [65, 'dBASPL'],
  HKQuantityTypeIdentifierEnvironmentalSoundReduction: [65, 'dBASPL'],
  HKQuantityTypeIdentifierEstimatedWorkoutEffortScore: [4, 'appleEffortScore'],
  HKQuantityTypeIdentifierFlightsClimbed: [4, 'count'],
  HKQuantityTypeIdentifierForcedExpiratoryVolume1: [3.5, 'L'],
  HKQuantityTypeIdentifierForcedVitalCapacity: [3.5, 'L'],
  HKQuantityTypeIdentifierHeadphoneAudioExposure: [65, 'dBASPL'],
  HKQuantityTypeIdentifierHeartRate: [72, 'count/min'],
  HKQuantityTypeIdentifierHeartRateRecoveryOneMinute: [72, 'count/min'],
  HKQuantityTypeIdentifierHeartRateVariabilityRMSSD: [42, 'ms'],
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: [42, 'ms'],
  HKQuantityTypeIdentifierHeight: [1.75, 'm'],
  HKQuantityTypeIdentifierInhalerUsage: [4, 'count'],
  HKQuantityTypeIdentifierInsulinDelivery: [2, 'IU'],
  HKQuantityTypeIdentifierLeanBodyMass: [72, 'kg'],
  HKQuantityTypeIdentifierNikeFuel: [4, 'count'],
  HKQuantityTypeIdentifierNumberOfAlcoholicBeverages: [4, 'count'],
  HKQuantityTypeIdentifierNumberOfTimesFallen: [4, 'count'],
  HKQuantityTypeIdentifierOxygenSaturation: [0.98, '%'],
  HKQuantityTypeIdentifierPaddleSportsSpeed: [1.4, 'm/s'],
  HKQuantityTypeIdentifierPeakExpiratoryFlowRate: [1.5, 'L/min'],
  HKQuantityTypeIdentifierPeripheralPerfusionIndex: [0.2, '%'],
  HKQuantityTypeIdentifierPhysicalEffort: [1.5, 'kcal/(kg*hr)'],
  HKQuantityTypeIdentifierPushCount: [4, 'count'],
  HKQuantityTypeIdentifierRespiratoryRate: [14, 'count/min'],
  HKQuantityTypeIdentifierRestingHeartRate: [58, 'count/min'],
  HKQuantityTypeIdentifierRowingSpeed: [1.4, 'm/s'],
  HKQuantityTypeIdentifierRunningGroundContactTime: [42, 'ms'],
  HKQuantityTypeIdentifierRunningPower: [180, 'W'],
  HKQuantityTypeIdentifierRunningSpeed: [1.4, 'm/s'],
  HKQuantityTypeIdentifierRunningStrideLength: [950, 'm'],
  HKQuantityTypeIdentifierRunningVerticalOscillation: [8, 'cm'],
  HKQuantityTypeIdentifierSixMinuteWalkTestDistance: [950, 'm'],
  HKQuantityTypeIdentifierStairAscentSpeed: [1.4, 'm/s'],
  HKQuantityTypeIdentifierStairDescentSpeed: [1.4, 'm/s'],
  HKQuantityTypeIdentifierStepCount: [1250, 'count'],
  HKQuantityTypeIdentifierSwimmingStrokeCount: [4, 'count'],
  HKQuantityTypeIdentifierTimeInDaylight: [30, 'min'],
  HKQuantityTypeIdentifierUVExposure: [4, 'count'],
  HKQuantityTypeIdentifierUnderwaterDepth: [950, 'm'],
  HKQuantityTypeIdentifierVO2Max: [1.5, 'ml/(kg*min)'],
  HKQuantityTypeIdentifierWaistCircumference: [950, 'm'],
  HKQuantityTypeIdentifierWalkingAsymmetryPercentage: [0.2, '%'],
  HKQuantityTypeIdentifierWalkingDoubleSupportPercentage: [0.2, '%'],
  HKQuantityTypeIdentifierWalkingHeartRateAverage: [96, 'count/min'],
  HKQuantityTypeIdentifierWalkingSpeed: [1.4, 'm/s'],
  HKQuantityTypeIdentifierWalkingStepLength: [950, 'm'],
  HKQuantityTypeIdentifierWaterTemperature: [36.6, 'degC'],
  HKQuantityTypeIdentifierWorkoutEffortScore: [4, 'appleEffortScore'],
};
/** @type {Record<string,number>} */
const categoryReadings = {
  HKCategoryTypeIdentifierAbdominalCramps: 2,
  HKCategoryTypeIdentifierAcne: 2,
  HKCategoryTypeIdentifierAppetiteChanges: 0,
  HKCategoryTypeIdentifierAppleStandHour: 0,
  HKCategoryTypeIdentifierAppleWalkingSteadinessEvent: 1,
  HKCategoryTypeIdentifierAudioExposureEvent: 1,
  HKCategoryTypeIdentifierBladderIncontinence: 2,
  HKCategoryTypeIdentifierBleedingAfterMenopause: 2,
  HKCategoryTypeIdentifierBleedingAfterPregnancy: 2,
  HKCategoryTypeIdentifierBleedingDuringPregnancy: 2,
  HKCategoryTypeIdentifierBloating: 2,
  HKCategoryTypeIdentifierBreastPain: 2,
  HKCategoryTypeIdentifierCervicalMucusQuality: 1,
  HKCategoryTypeIdentifierChestTightnessOrPain: 2,
  HKCategoryTypeIdentifierChills: 2,
  HKCategoryTypeIdentifierConstipation: 2,
  HKCategoryTypeIdentifierContraceptive: 1,
  HKCategoryTypeIdentifierCoughing: 2,
  HKCategoryTypeIdentifierDiarrhea: 2,
  HKCategoryTypeIdentifierDizziness: 2,
  HKCategoryTypeIdentifierDrySkin: 2,
  HKCategoryTypeIdentifierEnvironmentalAudioExposureEvent: 1,
  HKCategoryTypeIdentifierFainting: 2,
  HKCategoryTypeIdentifierFatigue: 2,
  HKCategoryTypeIdentifierFever: 2,
  HKCategoryTypeIdentifierGeneralizedBodyAche: 2,
  HKCategoryTypeIdentifierHairLoss: 2,
  HKCategoryTypeIdentifierHandwashingEvent: 0,
  HKCategoryTypeIdentifierHeadache: 2,
  HKCategoryTypeIdentifierHeadphoneAudioExposureEvent: 1,
  HKCategoryTypeIdentifierHeartburn: 2,
  HKCategoryTypeIdentifierHighHeartRateEvent: 0,
  HKCategoryTypeIdentifierHotFlashes: 2,
  HKCategoryTypeIdentifierHypertensionEvent: 0,
  HKCategoryTypeIdentifierInfrequentMenstrualCycles: 0,
  HKCategoryTypeIdentifierIntermenstrualBleeding: 0,
  HKCategoryTypeIdentifierIrregularHeartRhythmEvent: 0,
  HKCategoryTypeIdentifierIrregularMenstrualCycles: 0,
  HKCategoryTypeIdentifierLactation: 0,
  HKCategoryTypeIdentifierLossOfSmell: 2,
  HKCategoryTypeIdentifierLossOfTaste: 2,
  HKCategoryTypeIdentifierLowCardioFitnessEvent: 1,
  HKCategoryTypeIdentifierLowHeartRateEvent: 0,
  HKCategoryTypeIdentifierLowerBackPain: 2,
  HKCategoryTypeIdentifierMemoryLapse: 2,
  HKCategoryTypeIdentifierMenopausalState: 1,
  HKCategoryTypeIdentifierMenstrualFlow: 2,
  HKCategoryTypeIdentifierMindfulSession: 0,
  HKCategoryTypeIdentifierMoodChanges: 0,
  HKCategoryTypeIdentifierNausea: 2,
  HKCategoryTypeIdentifierNightSweats: 2,
  HKCategoryTypeIdentifierOvulationTestResult: 1,
  HKCategoryTypeIdentifierPelvicPain: 2,
  HKCategoryTypeIdentifierPersistentIntermenstrualBleeding: 0,
  HKCategoryTypeIdentifierPregnancy: 0,
  HKCategoryTypeIdentifierPregnancyTestResult: 1,
  HKCategoryTypeIdentifierProgesteroneTestResult: 1,
  HKCategoryTypeIdentifierProlongedMenstrualPeriods: 0,
  HKCategoryTypeIdentifierRapidPoundingOrFlutteringHeartbeat: 2,
  HKCategoryTypeIdentifierRunnyNose: 2,
  HKCategoryTypeIdentifierSexualActivity: 0,
  HKCategoryTypeIdentifierShortnessOfBreath: 2,
  HKCategoryTypeIdentifierSinusCongestion: 2,
  HKCategoryTypeIdentifierSkippedHeartbeat: 2,
  HKCategoryTypeIdentifierSleepAnalysis: 3,
  HKCategoryTypeIdentifierSleepApneaEvent: 0,
  HKCategoryTypeIdentifierSleepChanges: 0,
  HKCategoryTypeIdentifierSoreThroat: 2,
  HKCategoryTypeIdentifierToothbrushingEvent: 0,
  HKCategoryTypeIdentifierVaginalDryness: 2,
  HKCategoryTypeIdentifierVomiting: 2,
  HKCategoryTypeIdentifierWheezing: 2,
};

/** Full unit conversion fields returned by Health Connect reads. @param {number} kg */
function mass(kg) {
  return {
    inKilograms: kg,
    inGrams: kg * 1000,
    inMilligrams: kg * 1e6,
    inMicrograms: kg * 1e9,
    inOunces: kg * 35.27396195,
    inPounds: kg * 2.20462262,
  };
}
/** @param {number} meters */
function length(meters) {
  return {
    inMeters: meters,
    inKilometers: meters / 1000,
    inMiles: meters / 1609.344,
    inInches: meters / 0.0254,
    inFeet: meters / 0.3048,
  };
}
/** @param {number} kcal */
function energy(kcal) {
  return {
    inKilocalories: kcal,
    inCalories: kcal * 1000,
    inJoules: kcal * 4184,
    inKilojoules: kcal * 4.184,
  };
}
/** Generate one fictional reading for every installed native health type.
 * Payload fields follow the installed HealthKit 16.1 and Health Connect 4.1 read-result declarations.
 * @param {string} start @param {string} end */
export function healthMockReadings(start, end) {
  /** @param {number} index */
  const base = (index) => ({
    uuid: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    startDate: start,
    endDate: end,
    metadata: {},
  });
  const iosQuantities = quantities.map((type, index) => {
    const reading = quantityReadings[type];
    if (!reading) throw new Error(`Missing mock quantity: ${type}`);
    return record('health', type, 'healthkit', {
      ...base(index),
      quantityType: type,
      quantity: reading[0],
      unit: reading[1],
    });
  });
  const iosCategories = categories.map((type, index) =>
    record('health', type, 'healthkit', {
      ...base(index + quantities.length),
      categoryType: type,
      value: categoryReadings[type],
      ...(type === 'HKCategoryTypeIdentifierSleepAnalysis'
        ? { startDate: '2026-10-08T00:00:00.000Z', endDate: '2026-10-08T07:00:00.000Z' }
        : {}),
    }),
  );
  /** @type {Record<string,Record<string,unknown>>} */
  const extras = {
    HKWorkoutTypeIdentifier: {
      workoutActivityType: 52,
      duration: { quantity: 1800, unit: 's' },
      totalDistance: { quantity: 950, unit: 'm' },
      totalEnergyBurned: { quantity: 180, unit: 'kcal' },
      statistics: {},
      routes: [],
    },
    HKCorrelationTypeIdentifierBloodPressure: {
      correlationType: 'HKCorrelationTypeIdentifierBloodPressure',
      objects: iosQuantities
        .filter((row) => row.type.includes('BloodPressure'))
        .map((row) => row.native),
    },
    HKCorrelationTypeIdentifierFood: {
      correlationType: 'HKCorrelationTypeIdentifierFood',
      objects: iosQuantities
        .filter((row) => row.type === 'HKQuantityTypeIdentifierDietaryEnergyConsumed')
        .map((row) => row.native),
    },
    HKElectrocardiogramType: {
      classification: 'sinusRhythm',
      symptomsStatus: 'none',
      averageHeartRateBpm: 72,
      samplingFrequencyHz: 512,
      numberOfVoltageMeasurements: 3,
      voltages: [
        { timeSinceSampleStart: 0, voltage: 0.00012, lead: 'appleWatchSimilarToLeadI' },
        { timeSinceSampleStart: 0.001953125, voltage: 0.00016, lead: 'appleWatchSimilarToLeadI' },
        { timeSinceSampleStart: 0.00390625, voltage: 0.0001, lead: 'appleWatchSimilarToLeadI' },
      ],
    },
    HKDataTypeIdentifierHeartbeatSeries: {
      heartbeats: [
        { timeSinceSeriesStart: 0.83, precededByGap: false },
        { timeSinceSeriesStart: 1.66, precededByGap: false },
      ],
    },
    HKStateOfMindTypeIdentifier: {
      valence: 0.3,
      kind: 2,
      valenceClassification: 5,
      associations: [6],
      labels: [7, 8],
    },
  };
  const temperature = { inCelsius: 36.6, inFahrenheit: 97.88 };
  /** @type {Record<string,Record<string,unknown>>} */
  const android = {
    ActiveCaloriesBurned: { startTime: start, endTime: end, energy: energy(180) },
    BasalBodyTemperature: { time: start, temperature, measurementLocation: 0 },
    BasalMetabolicRate: {
      time: start,
      basalMetabolicRate: { inKilocaloriesPerDay: 1600, inWatts: 77.48148148 },
    },
    BloodGlucose: {
      time: start,
      level: { inMillimolesPerLiter: 5.1, inMilligramsPerDeciliter: 91.8 },
      specimenSource: 0,
      mealType: 0,
      relationToMeal: 0,
    },
    BloodPressure: {
      time: start,
      systolic: { inMillimetersOfMercury: 118 },
      diastolic: { inMillimetersOfMercury: 76 },
      bodyPosition: 0,
      measurementLocation: 0,
    },
    BodyFat: { time: start, percentage: 20 },
    BodyTemperature: { time: start, temperature, measurementLocation: 0 },
    BodyWaterMass: { time: start, mass: mass(40) },
    BoneMass: { time: start, mass: mass(3) },
    CervicalMucus: { time: start, appearance: 0, sensation: 0 },
    CyclingPedalingCadence: {
      startTime: start,
      endTime: end,
      samples: [{ time: start, revolutionsPerMinute: 80 }],
    },
    ElevationGained: { startTime: start, endTime: end, elevation: length(30) },
    ExerciseSession: {
      startTime: start,
      endTime: end,
      exerciseType: 79,
      title: 'Morning walk',
      segments: [],
      laps: [],
    },
    FloorsClimbed: { startTime: start, endTime: end, floors: 4 },
    HeartRate: {
      startTime: start,
      endTime: end,
      samples: [
        { time: start, beatsPerMinute: 72 },
        { time: end, beatsPerMinute: 75 },
      ],
    },
    RestingHeartRate: { time: start, beatsPerMinute: 58 },
    Steps: { startTime: start, endTime: end, count: 1250 },
    StepsCadence: { startTime: start, endTime: end, samples: [{ time: start, rate: 100 }] },
    Distance: { startTime: start, endTime: end, distance: length(950) },
    Height: { time: start, height: length(1.75) },
    Hydration: {
      startTime: start,
      endTime: end,
      volume: { inLiters: 0.25, inMilliliters: 250, inFluidOuncesUs: 8.45350568 },
    },
    HeartRateVariabilityRmssd: { time: start, heartRateVariabilityMillis: 42 },
    SexualActivity: { time: start, protectionUsed: 0 },
    SkinTemperature: {
      startTime: start,
      endTime: end,
      baseline: { inCelsius: 33, inFahrenheit: 91.4 },
      deltas: [{ time: start, delta: { inCelsius: 0.2, inFahrenheit: 0.36 } }],
      measurementLocation: 0,
    },
    Weight: { time: start, weight: mass(72) },
    Nutrition: {
      startTime: start,
      endTime: end,
      name: 'Breakfast',
      mealType: 1,
      energy: energy(420),
      protein: mass(0.02),
      totalCarbohydrate: mass(0.06),
    },
    LeanBodyMass: { time: start, mass: mass(58) },
    IntermenstrualBleeding: { time: start },
    Speed: {
      startTime: start,
      endTime: end,
      samples: [
        {
          time: start,
          speed: { inMetersPerSecond: 1.4, inKilometersPerHour: 5.04, inMilesPerHour: 3.131711 },
        },
      ],
    },
    MenstruationFlow: { time: start, flow: 1 },
    MenstruationPeriod: { time: start },
    MindfulnessSession: {
      startTime: start,
      endTime: end,
      mindfulnessSessionType: 0,
      title: 'Breathing session',
    },
    SleepSession: {
      startTime: '2026-10-08T00:00:00.000Z',
      endTime: '2026-10-08T07:00:00.000Z',
      stages: [
        { startTime: '2026-10-08T00:00:00.000Z', endTime: '2026-10-08T07:00:00.000Z', stage: 2 },
      ],
    },
    RespiratoryRate: { time: start, rate: 14 },
    WheelchairPushes: { startTime: start, endTime: end, count: 320 },
    Vo2Max: { time: start, vo2MillilitersPerMinuteKilogram: 42, measurementMethod: 0 },
    OvulationTest: { time: start, result: 1 },
    TotalCaloriesBurned: { startTime: start, endTime: end, energy: energy(225) },
    OxygenSaturation: { time: start, percentage: 98 },
    Power: {
      startTime: start,
      endTime: end,
      samples: [{ time: start, power: { inWatts: 180, inKilocaloriesPerDay: 3717.017208 } }],
    },
  };
  return [
    ...iosQuantities,
    ...iosCategories,
    ...characteristics.map((type) =>
      record('health', type, 'healthkit', {
        characteristicType: type,
        characteristicValue:
          type === 'HKCharacteristicTypeIdentifierDateOfBirth'
            ? { year: 1990, month: 1, day: 1, calendar: 'gregorian' }
            : 0,
        captureKind: 'current-snapshot',
        capturedAt: start,
      }),
    ),
    ...special.map((type, index) => {
      if (!extras[type]) throw new Error(`Missing mock special type: ${type}`);
      return record('health', type, 'healthkit', {
        ...base(index + quantities.length + categories.length),
        ...extras[type],
      });
    }),
    ...androidTypes.map((type) => {
      if (!android[type]) throw new Error(`Missing mock Android type: ${type}`);
      return record('health', type, 'health-connect', { recordType: type, ...android[type] });
    }),
  ];
}
