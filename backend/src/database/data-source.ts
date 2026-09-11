import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { createPostgresDataSourceOptions } from './data-source.options';

const postgresDataSource = new DataSource(
  createPostgresDataSourceOptions(process.env),
);

export default postgresDataSource;
