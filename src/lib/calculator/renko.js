

import { merge, isNotDefined, functor } from "../utils";

import atr from "./atr";

import { Renko as defaultOptions } from "./defaultOptionsForComputation";

export default function() {
	let options = defaultOptions;

	let dateAccessor = d => d.date;
	let dateMutator = (d, date) => { d.date = date; };

	function calculator(rawData) {
		const { reversalType, fixedBrickSize, sourcePath, windowSize, continuousBrick, eodUnfinishedBrick, brickNumbering } = options;

		const source = sourcePath === "high/low"
			? d => { return { high: d.high, low: d.low }; }
			: d => { return { high: d.close, low: d.close }; };

		const pricingMethod = source;
		let brickSize;

		if (reversalType === "ATR") {
			// calculateATR(rawData, period);
			const atrAlgorithm = atr().options({ windowSize });

			const atrCalculator = merge()
				.algorithm(atrAlgorithm)
				.merge((d, c) => { d["atr" + windowSize] = c; } );

			atrCalculator(rawData);
			brickSize = d => d["atr" + windowSize];
		} else {
			brickSize = functor(fixedBrickSize);
		}

		const renkoData = [];

		let index = 0, prevBrickClose = rawData[index].open, prevBrickOpen = rawData[index].open;
		let brick = {}, direction = 0;
		let brickNo = 0, prevDirection = 0;

		rawData.forEach(function(d, idx) {
			if (!continuousBrick && idx !== 0 && d.date.getDate() !== rawData[idx - 1].date.getDate()) {
				// date changing
				const prevRawData = rawData[idx - 1];

				// collect prev unfinished brick
				if (eodUnfinishedBrick && isNotDefined(brick.to)) {
					brick.close = direction > 0 ? pricingMethod(prevRawData).high : pricingMethod(prevRawData).low;
					brick.to = idx - 1;
					brick.toDate = dateAccessor(prevRawData);
					dateMutator(brick, dateAccessor(prevRawData));
					brick.fullyFormed = false;
					renkoData.push(brick);
				}

				// reset values to restart renko calculation for this day
				prevBrickClose = d.open;
				prevBrickOpen = d.open;
				brick = {};
				direction = 0;
				brickNo = 0;
			}

			if (isNotDefined(brick.from)) {
				brick.high = d.high;
				brick.low = d.low;
				brick.startOfYear = d.startOfYear;
				brick.startOfQuarter = d.startOfQuarter;
				brick.startOfMonth = d.startOfMonth;
				brick.startOfWeek = d.startOfWeek;

				brick.from = idx;
				brick.fromDate = dateAccessor(d);
				// indexMutator(brick, index++);
				dateMutator(brick, dateAccessor(d));
			}
			brick.volume = (brick.volume || 0) + d.volume;

			const prevCloseToHigh = (prevBrickClose - pricingMethod(d).high),
				prevCloseToLow = (prevBrickClose - pricingMethod(d).low),
				prevOpenToHigh = (prevBrickOpen - pricingMethod(d).high),
				prevOpenToLow = (prevBrickOpen - pricingMethod(d).low),
				priceMovement = Math.min(
					Math.abs(prevCloseToHigh),
					Math.abs(prevCloseToLow),
					Math.abs(prevOpenToHigh),
					Math.abs(prevOpenToLow));


			brick.high = Math.max(brick.high, d.high);
			brick.low = Math.min(brick.low, d.low);

			if (!brick.startOfYear) {
				brick.startOfYear = d.startOfYear;
				if (brick.startOfYear) {
					dateMutator(brick, dateAccessor(d));
					// brick.displayDate = d.displayDate;
				}
			}

			if (!brick.startOfQuarter) {
				brick.startOfQuarter = d.startOfQuarter;
				if (brick.startOfQuarter && !brick.startOfYear) {
					dateMutator(brick, dateAccessor(d));
					// brick.displayDate = d.displayDate;
				}
			}

			if (!brick.startOfMonth) {
				brick.startOfMonth = d.startOfMonth;
				if (brick.startOfMonth && !brick.startOfQuarter) {
					dateMutator(brick, dateAccessor(d));
					// brick.displayDate = d.displayDate;
				}
			}
			if (!brick.startOfWeek) {
				brick.startOfWeek = d.startOfWeek;
				if (brick.startOfWeek && !brick.startOfMonth) {
					dateMutator(brick, dateAccessor(d));
					// brick.displayDate = d.displayDate;
				}
			}

			// d.brick = JSON.stringify(brick);
			if (brickSize(d)) {
				const noOfBricks = Math.floor(priceMovement / brickSize(d));

				brick.open = (Math.abs(prevCloseToHigh) < Math.abs(prevOpenToHigh)
					|| Math.abs(prevCloseToLow) < Math.abs(prevOpenToLow))
					? prevBrickClose
					: prevBrickOpen;

				if (noOfBricks >= 1) {
					let j = 0;
					for (j = 0; j < noOfBricks; j++) {
						brick.close = (brick.open < pricingMethod(d).high)
							// if brick open is less than current price it means it is green/hollow brick
							? brick.open + brickSize(d)
							: brick.open - brickSize(d);
						direction = brick.close > brick.open ? 1 : -1;
						brick.direction = direction;
						brick.to = idx;
						brick.toDate = dateAccessor(d);
						// brick.diff = brick.open - brick.close;
						// brick.atr = d.atr;
						brick.fullyFormed = true;

						// brick numbering
						if (prevDirection === direction) {
							brickNo += 1;
						} else {
							brickNo = 1;
							prevDirection = direction;
						}
						if (brickNumbering) {
							brick.brickNo = brickNo;
						}

						renkoData.push(brick);

						prevBrickClose = brick.close;
						prevBrickOpen = brick.open;

						const newBrick = {
							high: brick.high,
							low: brick.low,
							open: brick.close,
							startOfYear: false,
							startOfMonth: false,
							startOfQuarter: false,
							startOfWeek: false
						};
						brick = newBrick;
						brick.from = idx;
						brick.fromDate = dateAccessor(d);
						// indexMutator(brick, index + j);
						dateMutator(brick, dateAccessor(d));
						brick.volume = (brick.volume || 0) + d.volume;
					}
					index = index + j - 1;
					brick = {};
				} else {
					if (idx === rawData.length - 1) {
						brick.close = direction > 0 ? pricingMethod(d).high : pricingMethod(d).low;
						brick.to = idx;
						brick.toDate = dateAccessor(d);
						dateMutator(brick, dateAccessor(d));
						brick.fullyFormed = false;
						renkoData.push(brick);
					}
				}
			}
		});
		return renkoData;

	}
	calculator.options = function(x) {
		if (!arguments.length) {
			return options;
		}
		options = { ...defaultOptions, ...x };
		return calculator;
	};

	calculator.dateMutator = function(x) {
		if (!arguments.length) return dateMutator;
		dateMutator = x;
		return calculator;
	};
	calculator.dateAccessor = function(x) {
		if (!arguments.length) return dateAccessor;
		dateAccessor = x;
		return calculator;
	};

	return calculator;
}
