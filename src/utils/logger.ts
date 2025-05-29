import winston from 'winston';
import path from 'path';

export const setupLogger = () => {
    const logLevel = process.env.LOG_LEVEL || 'info';
    const logFile = process.env.LOG_FILE || './logs/bot.log';

    // 确保日志目录存在
    const logDir = path.dirname(logFile);
    
    const logger = winston.createLogger({
        level: logLevel,
        format: winston.format.combine(
            winston.format.timestamp({
                format: () => {
                    // 使用中国时区（东八区）时间
                    return new Date().toLocaleString('zh-CN', {
                        timeZone: 'Asia/Shanghai',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    }).replace(/\//g, '-');
                }
            }),
            winston.format.errors({ stack: true }),
            winston.format.json()
        ),
        defaultMeta: { service: 'pals-bot' },
        transports: [
            // 写入所有日志到文件
            new winston.transports.File({ 
                filename: logFile.replace('.log', '-error.log'), 
                level: 'error' 
            }),
            new winston.transports.File({ 
                filename: logFile 
            }),
        ],
    });

    // 如果不是生产环境，也输出到控制台
    if (process.env.NODE_ENV !== 'production') {
        logger.add(new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }));
    }

    return logger;
};

export const logger = setupLogger(); 