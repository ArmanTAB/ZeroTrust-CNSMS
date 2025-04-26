// src/types/recharts.d.ts
import React from 'react';

declare module 'recharts' {
  // Перекрываем экспортируемые компоненты с корректной типизацией для React
  export class XAxis extends React.Component<any> {}
  export class YAxis extends React.Component<any> {}
  export class CartesianGrid extends React.Component<any> {}
  export class Tooltip extends React.Component<any> {}
  export class Legend extends React.Component<any> {}
  export class BarChart extends React.Component<any> {}
  export class Bar extends React.Component<any> {}
  export class PieChart extends React.Component<any> {}
  export class Pie extends React.Component<any> {}
  export class Cell extends React.Component<any> {}
  export class ResponsiveContainer extends React.Component<any> {}
}