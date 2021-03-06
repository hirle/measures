import Config, { SensorConfig, MeasurementSupplierConfig, RecorderConfig } from './Config';
import DefaultConfig from './default.config.json';
import fs from 'fs';
import Logger from "./Logger";
import Web from "./Web";
import GetVersion from './GetVersion';
import SupplierHandler from './handlers/SupplierHandler';
import { ApiVersionInterface } from '@measurements/restapiinterface';
import {  SensorCollection } from './sensors/Sensor';
import { SensorFactory } from './sensors/SensorFactory';
import { Measurement, MeasurementSupplier, MeasurementSupplierCollection } from './Measurement';
import MeasurementsDatabase from './MeasurementsDatabase';
import RecorderFactory from './recorders/RecorderFactory';
import { RecorderCollection } from './recorders/Recorder';
import PromiseSupplierHandler from './handlers/PromiseSupplierHandler';
import RecorderLatestMeasurementsHandler from './handlers/RecorderLatestMeasurementsHandler';
import ManualRecorder from './recorders/ManualRecorder';
import PeriodicRecorder from './recorders/PeriodicRecorder';
import RunnableHandler from './handlers/RunnableHandler';

export function run(argv: string[]): number {
    
    const config = processArgv(argv);

    const logger: Logger = Logger.create(config.logs);

    const database : MeasurementsDatabase = new MeasurementsDatabase(config.database);

    const sensors: SensorCollection = setUpSensors(config.sensors);

    const measurementSuppliers = setupMeasurementSuppliers(config.measurements, sensors);

    const recorders = setupRecorders( config.recorders, measurementSuppliers, database );

    const web = new Web(config['http-port']);
    
    web.startOn()
    
    setupApiRoutes(web, measurementSuppliers, recorders);

    logger.info('Ready!');

    return 0;
}

function setUpSensors(sensors: SensorConfig[]): SensorCollection {
  return new SensorCollection( sensors.map( sensorConfig => SensorFactory.create(sensorConfig)) );
}

function setupMeasurementSuppliers( measurementConfigs: MeasurementSupplierConfig[], sensors: SensorCollection ): MeasurementSupplierCollection {
  return new MeasurementSupplierCollection(measurementConfigs.map( measurementConfig => {
    const sensor = sensors.findById( measurementConfig['sensor-id']);
    if( ! sensor.getValuesKeys().has(measurementConfig['sensor-key']) ) {
      throw new Error(`Measurement ${measurementConfig.id} wants unknown sensor-key ${measurementConfig['sensor-key']}`);
    }
    return new MeasurementSupplier(measurementConfig.id, sensor, measurementConfig['sensor-key']);
  }));
}

function setupRecorders( recorderConfigs: RecorderConfig[], measurementSuppliers: MeasurementSupplierCollection, measurementDb: MeasurementsDatabase ): RecorderCollection {
  return new RecorderCollection( recorderConfigs.map( recorderConfig => {
    const measurementSupplier = measurementSuppliers.findById(recorderConfig['measurement-id'])
    return RecorderFactory.create(recorderConfig, measurementSupplier, measurementDb);
  }));
}

function setupApiRoutes(
  web: Web,
  measurementSuppliers: MeasurementSupplierCollection,
  recorders: RecorderCollection ) {

  // TODO set to process.env.npm_package_version
  const getVersion = new GetVersion('0.0.1');
  web.recordGetRoute('/api/version',SupplierHandler.create<ApiVersionInterface>(getVersion));

  measurementSuppliers.forEach(  ( measurementSupplier: MeasurementSupplier ) => {
    web.recordGetRoute(`/api/measurement/${measurementSupplier.id}/current`,
    PromiseSupplierHandler.create<Measurement>(measurementSupplier));
  });

  recorders.forEach( recorder => {
    web.recordGetRoute(
      `/api/recorder/${recorder.id}/measurements/latest(?:/:count([0-9]+))?`,
      RecorderLatestMeasurementsHandler.create(recorder)
    );
    if( recorder instanceof ManualRecorder ) {
      web.recordPostRoute(`/api/recorder/${recorder.id}/recordOneMeasurement`,
        PromiseSupplierHandler.create<Measurement>(recorder)
      );
    }
    if( recorder instanceof PeriodicRecorder ) {
        web.recordPostRoute(
          `/api/recorder/${recorder.id}/startRecording`,
          RunnableHandler.create(() => recorder.start())
        );
        web.recordPostRoute(
          `/api/recorder/${recorder.id}/stopRecording`,
          RunnableHandler.create(() => recorder.stop())
        );
    }
  });
}

function processArgv(argv: string[]): Config {
  switch( argv.length ) 
  {
    case 2: return DefaultConfig; 
    case 3: throw new Error('Missing argument: ./path/to/config.json');
    case 4: if( argv[2] === '--config' ) {
        return JSON.parse(fs.readFileSync(argv[3], 'utf8'))
      }  else {
        throw new Error('Bad argument');
      } 
    default:  
      throw new Error('Bad argument');
  }
}
